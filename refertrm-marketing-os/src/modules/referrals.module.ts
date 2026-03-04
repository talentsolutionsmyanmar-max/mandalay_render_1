import { Module, Controller, Get, Post, Put, Body, Param, Query, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { PrismaService } from '../prisma.service';

// DTOs
export class CreateReferralDto {
  @IsString() referrerId: string;
  @IsString() referredId: string;
  @IsOptional() @IsString() jobId?: string;
}

export class ProcessRewardDto {
  @IsNumber() amount: number;
}

// Reward Tiers
const REWARD_TIERS = {
  STARTER: { multiplier: 1.0, minReferrals: 0 },
  BRONZE: { multiplier: 1.1, minReferrals: 3 },
  SILVER: { multiplier: 1.25, minReferrals: 10 },
  GOLD: { multiplier: 1.5, minReferrals: 25 },
};

// Service
@Injectable()
export class ReferralsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: { status?: string; referrerId?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.referrerId) where.referrerId = filters.referrerId;
    return this.prisma.referral.findMany({
      where,
      include: { referrer: true, referred: true, job: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.referral.findUnique({
      where: { id },
      include: { referrer: true, referred: true, job: true },
    });
  }

  async create(data: CreateReferralDto) {
    // Create referral
    const referral = await this.prisma.referral.create({
      data: { ...data, status: 'PENDING' },
    });

    // Update referrer stats
    await this.prisma.candidate.update({
      where: { id: data.referrerId },
      data: { totalReferrals: { increment: 1 } },
    });

    return referral;
  }

  async verify(id: string) {
    return this.prisma.referral.update({
      where: { id },
      data: { status: 'VERIFIED' },
    });
  }

  async markHired(id: string) {
    const referral = await this.prisma.referral.update({
      where: { id },
      data: { status: 'HIRED', hiredAt: new Date() },
      include: { referrer: true },
    });

    // Update referrer successful count
    await this.prisma.candidate.update({
      where: { id: referral.referrerId },
      data: { successfulReferrals: { increment: 1 } },
    });

    // Check for tier upgrade
    await this.checkTierUpgrade(referral.referrerId);

    return referral;
  }

  async processReward(id: string, baseAmount: number) {
    const referral = await this.prisma.referral.findUnique({
      where: { id },
      include: { referrer: true },
    });

    if (!referral) throw new Error('Referral not found');

    // Calculate reward with tier multiplier
    const tier = referral.referrer.referralTier as keyof typeof REWARD_TIERS;
    const multiplier = REWARD_TIERS[tier]?.multiplier || 1.0;
    const finalAmount = baseAmount * multiplier;

    // Update referral
    await this.prisma.referral.update({
      where: { id },
      data: { status: 'REWARDED', rewardAmount: finalAmount, rewardPaidAt: new Date() },
    });

    // Update referrer earnings
    await this.prisma.candidate.update({
      where: { id: referral.referrerId },
      data: { totalEarnings: { increment: finalAmount } },
    });

    return { referralId: id, amount: finalAmount, multiplier, tier };
  }

  async getLeaderboard(limit: number = 20) {
    return this.prisma.candidate.findMany({
      where: { successfulReferrals: { gt: 0 } },
      orderBy: [{ successfulReferrals: 'desc' }, { totalEarnings: 'desc' }],
      take: limit,
      select: {
        id: true, firstName: true, lastName: true,
        referralTier: true, successfulReferrals: true, totalEarnings: true,
      },
    });
  }

  async getStats() {
    const [total, pending, verified, hired, rewarded, totalPaid] = await Promise.all([
      this.prisma.referral.count(),
      this.prisma.referral.count({ where: { status: 'PENDING' } }),
      this.prisma.referral.count({ where: { status: 'VERIFIED' } }),
      this.prisma.referral.count({ where: { status: 'HIRED' } }),
      this.prisma.referral.count({ where: { status: 'REWARDED' } }),
      this.prisma.referral.aggregate({ _sum: { rewardAmount: true } }),
    ]);
    return { total, pending, verified, hired, rewarded, totalPaid: totalPaid._sum.rewardAmount || 0 };
  }

  private async checkTierUpgrade(candidateId: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) return;

    let newTier = 'STARTER';
    if (candidate.successfulReferrals >= 25) newTier = 'GOLD';
    else if (candidate.successfulReferrals >= 10) newTier = 'SILVER';
    else if (candidate.successfulReferrals >= 3) newTier = 'BRONZE';

    if (newTier !== candidate.referralTier) {
      await this.prisma.candidate.update({
        where: { id: candidateId },
        data: { referralTier: newTier },
      });
    }
  }
}

// Controller
@ApiTags('Referrals')
@Controller('api/referrals')
export class ReferralsController {
  constructor(private service: ReferralsService) {}

  @Get()
  @ApiOperation({ summary: 'List all referrals' })
  findAll(@Query('status') status?: string, @Query('referrerId') referrerId?: string) {
    return this.service.findAll({ status, referrerId });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get referral statistics' })
  getStats() { return this.service.getStats(); }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get referral leaderboard' })
  getLeaderboard(@Query('limit') limit?: number) { return this.service.getLeaderboard(limit); }

  @Get('tiers')
  @ApiOperation({ summary: 'Get reward tier information' })
  getTiers() { return REWARD_TIERS; }

  @Get(':id')
  @ApiOperation({ summary: 'Get referral by ID' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  @ApiOperation({ summary: 'Create referral' })
  create(@Body() dto: CreateReferralDto) { return this.service.create(dto); }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify referral' })
  verify(@Param('id') id: string) { return this.service.verify(id); }

  @Post(':id/hired')
  @ApiOperation({ summary: 'Mark referral as hired' })
  markHired(@Param('id') id: string) { return this.service.markHired(id); }

  @Post(':id/reward')
  @ApiOperation({ summary: 'Process reward payment' })
  processReward(@Param('id') id: string, @Body() dto: ProcessRewardDto) {
    return this.service.processReward(id, dto.amount);
  }
}

@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService, PrismaService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
