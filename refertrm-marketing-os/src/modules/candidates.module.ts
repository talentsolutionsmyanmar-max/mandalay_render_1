import { Module, Controller, Get, Post, Put, Delete, Body, Param, Query, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEmail, IsArray, IsBoolean } from 'class-validator';
import { PrismaService } from '../prisma.service';

// DTOs
export class CreateCandidateDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() headline?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsArray() skills?: string[];
  @IsOptional() @IsNumber() yearsExperience?: number;
  @IsOptional() @IsString() currentCity?: string;
  @IsOptional() @IsNumber() expectedSalary?: number;
  @IsOptional() @IsString() linkedinUrl?: string;
}

export class UpdateCandidateDto extends CreateCandidateDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsBoolean() isVerified?: boolean;
}

// Service
@Injectable()
export class CandidatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: { status?: string; skills?: string; city?: string; search?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.city) where.currentCity = { contains: filters.city, mode: 'insensitive' };
    if (filters.skills) where.skills = { hasSome: filters.skills.split(',') };
    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.candidate.findMany({
      where,
      include: {
        applications: { include: { job: { include: { company: true } } }, take: 5 },
        cohortEnrollments: { include: { cohort: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.candidate.findUnique({
      where: { id },
      include: {
        applications: { include: { job: { include: { company: true } } } },
        cohortEnrollments: { include: { cohort: true } },
        referralsMade: { include: { referred: true, job: true } },
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.candidate.findUnique({ where: { email } });
  }

  async create(data: CreateCandidateDto) {
    const referralCode = this.generateReferralCode(data.firstName, data.lastName);
    return this.prisma.candidate.create({
      data: { ...data, referralCode, profileCompletion: this.calculateCompletion(data) },
    });
  }

  async update(id: string, data: UpdateCandidateDto) {
    const updateData: any = { ...data };
    if (data.skills || data.bio || data.headline) {
      const existing = await this.prisma.candidate.findUnique({ where: { id } });
      updateData.profileCompletion = this.calculateCompletion({ ...existing, ...data });
    }
    return this.prisma.candidate.update({ where: { id }, data: updateData });
  }

  async delete(id: string) {
    return this.prisma.candidate.delete({ where: { id } });
  }

  async getByReferralCode(code: string) {
    return this.prisma.candidate.findUnique({ where: { referralCode: code } });
  }

  async getReferralStats(candidateId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { referralsMade: { include: { referred: true, job: true } } },
    });
    return {
      totalReferrals: candidate?.totalReferrals || 0,
      successfulReferrals: candidate?.successfulReferrals || 0,
      totalEarnings: candidate?.totalEarnings || 0,
      referralTier: candidate?.referralTier || 'STARTER',
      referralCode: candidate?.referralCode,
      referrals: candidate?.referralsMade || [],
    };
  }

  async getTopReferrers(limit: number = 10) {
    return this.prisma.candidate.findMany({
      where: { successfulReferrals: { gt: 0 } },
      orderBy: { successfulReferrals: 'desc' },
      take: limit,
      select: { id: true, firstName: true, lastName: true, referralTier: true, successfulReferrals: true, totalEarnings: true },
    });
  }

  async getStats() {
    const [total, active, placed, verified] = await Promise.all([
      this.prisma.candidate.count(),
      this.prisma.candidate.count({ where: { status: 'ACTIVE' } }),
      this.prisma.candidate.count({ where: { status: 'PLACED' } }),
      this.prisma.candidate.count({ where: { isVerified: true } }),
    ]);
    return { total, active, placed, verified };
  }

  private generateReferralCode(firstName: string, lastName: string): string {
    const prefix = (firstName[0] + lastName[0]).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${random}`;
  }

  private calculateCompletion(data: any): number {
    const fields = ['firstName', 'lastName', 'email', 'phone', 'headline', 'bio', 'skills', 'currentCity', 'expectedSalary', 'linkedinUrl'];
    const filled = fields.filter(f => data[f] && (Array.isArray(data[f]) ? data[f].length > 0 : true)).length;
    return Math.round((filled / fields.length) * 100);
  }
}

// Controller
@ApiTags('Candidates')
@Controller('api/candidates')
export class CandidatesController {
  constructor(private service: CandidatesService) {}

  @Get()
  @ApiOperation({ summary: 'List all candidates' })
  findAll(@Query('status') status?: string, @Query('skills') skills?: string, @Query('city') city?: string, @Query('search') search?: string) {
    return this.service.findAll({ status, skills, city, search });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get candidate statistics' })
  getStats() { return this.service.getStats(); }

  @Get('top-referrers')
  @ApiOperation({ summary: 'Get top referrers' })
  getTopReferrers(@Query('limit') limit?: number) { return this.service.getTopReferrers(limit); }

  @Get('referral/:code')
  @ApiOperation({ summary: 'Get candidate by referral code' })
  getByReferralCode(@Param('code') code: string) { return this.service.getByReferralCode(code); }

  @Get(':id')
  @ApiOperation({ summary: 'Get candidate by ID' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Get(':id/referral-stats')
  @ApiOperation({ summary: 'Get referral stats for candidate' })
  getReferralStats(@Param('id') id: string) { return this.service.getReferralStats(id); }

  @Post()
  @ApiOperation({ summary: 'Create candidate' })
  create(@Body() dto: CreateCandidateDto) { return this.service.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Update candidate' })
  update(@Param('id') id: string, @Body() dto: UpdateCandidateDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete candidate' })
  delete(@Param('id') id: string) { return this.service.delete(id); }
}

@Module({
  controllers: [CandidatesController],
  providers: [CandidatesService, PrismaService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
