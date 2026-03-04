import { Module, Controller, Get, Post, Body, Param, Query, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { PrismaService } from '../prisma.service';

// Enums
enum TikTokTopic {
  SUCCESS_STORY = 'SUCCESS_STORY',
  SALARY_REVEAL = 'SALARY_REVEAL',
  INTERVIEW_TIPS = 'INTERVIEW_TIPS',
  DAY_IN_LIFE = 'DAY_IN_LIFE',
  REFERRAL_EARNINGS = 'REFERRAL_EARNINGS',
  COHORT_EXPERIENCE = 'COHORT_EXPERIENCE',
  JOB_SEARCH_TIPS = 'JOB_SEARCH_TIPS',
}

// DTOs
export class GenerateScriptDto {
  @IsString() topic: string;
  @IsOptional() @IsString() candidateId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsNumber() duration?: number;
  @IsOptional() @IsString() targetRole?: string;
  @IsOptional() @IsString() customAngle?: string;
}

export class MarkPublishedDto {
  @IsString() scriptId: string;
  @IsString() tiktokUrl: string;
  @IsOptional() @IsString() notes?: string;
}

// Script Templates
const SCRIPT_TEMPLATES: Record<string, { hooks: string[]; structure: string; hashtags: string[] }> = {
  SUCCESS_STORY: {
    hooks: [
      'လွန်ခဲ့တဲ့ ၆ လက ကျွန်တော် အလုပ်မရှိဘူး... အခု {{company}} မှာ {{role}} ဖြစ်သွားပြီ',
      '{{salary_before}} ကနေ {{salary_after}} ရောက်သွားတဲ့ journey',
      'referTRM ကြောင့် ဘဝပြောင်းသွားတယ် - ဒါက ကျွန်တော့် story',
    ],
    structure: `
HOOK (0-3 sec): {{hook}}
[Visual: Face close-up, emotional]

BEFORE (3-10 sec):
"{{before_situation}}"
[Visual: Previous struggle - empty desk, rejection]

THE CHANGE (10-25 sec):
"{{discovery_moment}}"
[Visual: referTRM platform, training]

AFTER (25-45 sec):
"{{current_success}}"
[Visual: Current workplace, happy moments]

ADVICE (45-55 sec):
"{{advice}}"
[Visual: Direct to camera]

CTA (55-60 sec):
"{{call_to_action}}"
[Visual: referTRM link]
    `,
    hashtags: ['#MyanmarJobs', '#CareerTransformation', '#referTRM', '#SuccessStory', '#JobSearch'],
  },

  SALARY_REVEAL: {
    hooks: [
      'Myanmar မှာ {{role}} တစ်ယောက် ဘယ်လောက်ရလဲ? Real numbers ပြောပြမယ်',
      '{{industry}} industry salary breakdown - no cap',
    ],
    structure: `
HOOK (0-3 sec): {{hook}}
[Visual: Money animation]

ENTRY LEVEL (3-15 sec):
"Fresh graduate - K {{entry_salary}} per month"
[Visual: Breakdown graphics]

MID LEVEL (15-30 sec):
"2-4 years experience - K {{mid_salary}}"
[Visual: Skill icons]

SENIOR (30-45 sec):
"5+ years - K {{senior_salary}}"
[Visual: Executive office]

HOW TO LEVEL UP (45-55 sec):
"Salary တက်ချင်ရင် {{tip}}"
[Visual: referTRM cohort]

CTA (55-60 sec):
"Salary checker link in bio"
    `,
    hashtags: ['#SalaryMyanmar', '#CareerGrowth', '#MoneyTalk', '#referTRM'],
  },

  INTERVIEW_TIPS: {
    hooks: [
      'HR manager ပြောရရင် - ဒီအမှားတွေ မလုပ်ပါနဲ့',
      '90% of candidates fail because of this',
    ],
    structure: `
HOOK (0-3 sec): {{hook}}
[Visual: Interview setting]

MISTAKE #1 (3-15 sec):
"{{mistake_1}}"
"Instead: {{solution_1}}"
[Visual: Wrong vs Right]

MISTAKE #2 (15-25 sec):
"{{mistake_2}}"
[Visual: Demonstration]

MISTAKE #3 (25-40 sec):
"{{mistake_3}}"
[Visual: HR reaction]

THE SECRET (40-55 sec):
"{{secret_tip}}"
[Visual: Confident candidate]

CTA (55-60 sec):
"Interview prep - link in bio"
    `,
    hashtags: ['#InterviewTips', '#JobInterview', '#MyanmarJobs', '#CareerAdvice', '#referTRM'],
  },

  REFERRAL_EARNINGS: {
    hooks: [
      'သူငယ်ချင်းကို job ရှာပေးရုံနဲ့ K {{amount}} ရတယ်',
      'Side income idea - referral program',
    ],
    structure: `
HOOK (0-3 sec): {{hook}}
[Visual: Cash/transfer notification]

EXPLAIN (3-20 sec):
"referTRM referral program"
"သင့်သူငယ်ချင်း hired ဖြစ်ရင် reward ရမယ်"
[Visual: Simple diagram]

REWARD TIERS (20-35 sec):
"Starter: K 150,000"
"Bronze (3+): 1.1x"
"Silver (10+): 1.25x"
"Gold (25+): 1.5x"
[Visual: Tier graphics]

PROOF (35-50 sec):
"{{referrals}} ယောက် refer ခဲ့တယ်"
"Total: K {{earnings}}"
[Visual: Dashboard screenshots]

CTA (50-60 sec):
"Start referring - link in bio"
    `,
    hashtags: ['#SideHustle', '#ReferralProgram', '#EarnMoney', '#MyanmarIncome', '#referTRM'],
  },
};

// Trending sounds
const TRENDING_SOUNDS = [
  { name: 'Acoustic Myanmar compilation', category: 'background' },
  { name: 'Motivational beats', category: 'success' },
  { name: 'Corporate upbeat', category: 'professional' },
  { name: 'Success story montage', category: 'transformation' },
];

// Service
@Injectable()
export class TikTokService {
  constructor(private prisma: PrismaService) {}

  async generateScript(dto: GenerateScriptDto) {
    const template = SCRIPT_TEMPLATES[dto.topic];
    if (!template) {
      throw new Error(`Unknown topic: ${dto.topic}`);
    }

    // Build context
    let context: any = {
      role: dto.targetRole || 'Professional',
      company: 'Top Company',
      salary_before: 'K 300,000',
      salary_after: 'K 600,000',
      entry_salary: '400,000 - 600,000',
      mid_salary: '800,000 - 1,200,000',
      senior_salary: '1,500,000+',
      amount: '200,000',
      referrals: '5',
      earnings: '750,000',
    };

    // Fetch candidate data if provided
    if (dto.candidateId) {
      const candidate = await this.prisma.candidate.findUnique({
        where: { id: dto.candidateId },
        include: {
          applications: {
            where: { status: 'ACCEPTED' },
            include: { job: { include: { company: true } } },
          },
        },
      });

      if (candidate) {
        context.name = candidate.firstName;
        const placement = candidate.applications[0];
        if (placement) {
          context.role = placement.job.title;
          context.company = placement.job.company.name;
        }
      }
    }

    // Select random hook
    const hook = template.hooks[Math.floor(Math.random() * template.hooks.length)];
    const processedHook = this.replacePlaceholders(hook, context);

    // Process structure
    const script = this.replacePlaceholders(template.structure, context);

    // Extract visual cues
    const visualCues = this.extractVisualCues(script);

    // Select sounds
    const sounds = TRENDING_SOUNDS.slice(0, 3).map(s => s.name);

    // Generate caption
    const caption = `${processedHook.substring(0, 100)}...\n\n${template.hashtags.join(' ')}`;

    // Store script
    const content = await this.prisma.content.create({
      data: {
        type: 'VIDEO_SCRIPT',
        title: `TikTok: ${dto.topic}`,
        slug: `tiktok-${dto.topic.toLowerCase()}-${Date.now()}`,
        body: script,
        excerpt: processedHook,
        keywords: template.hashtags,
        platforms: ['TIKTOK'],
        aiGenerated: true,
        aiPrompt: JSON.stringify(dto),
        status: 'DRAFT',
      },
    });

    return {
      id: content.id,
      hook: processedHook,
      script,
      visualCues,
      sounds,
      hashtags: template.hashtags,
      caption,
      optimalPostingTime: this.getOptimalTime(),
      duration: dto.duration || 60,
    };
  }

  async markPublished(dto: MarkPublishedDto) {
    return this.prisma.content.update({
      where: { id: dto.scriptId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }

  async getUnpublishedScripts() {
    return this.prisma.content.findMany({
      where: { type: 'VIDEO_SCRIPT', platforms: { has: 'TIKTOK' }, status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async recordMetrics(contentId: string, metrics: { views: number; likes: number; shares: number; comments: number }) {
    // Store metrics (in production, create a ContentMetric model)
    await this.prisma.analyticsEvent.create({
      data: {
        eventType: 'TIKTOK_METRICS',
        eventData: { contentId, ...metrics },
        sessionId: `tiktok_${contentId}`,
      },
    });
    return { success: true };
  }

  getTopics() {
    return Object.keys(SCRIPT_TEMPLATES);
  }

  private replacePlaceholders(text: string, context: any): string {
    let result = text;
    Object.entries(context).forEach(([key, value]) => {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    });
    result = result.replace(/{{[^}]+}}/g, '[ADD CONTENT]');
    return result;
  }

  private extractVisualCues(script: string): string[] {
    const cues: string[] = [];
    const matches = script.matchAll(/\[Visual: ([^\]]+)\]/g);
    for (const match of matches) {
      cues.push(match[1]);
    }
    return cues;
  }

  private getOptimalTime(): string {
    const isWeekend = [0, 6].includes(new Date().getDay());
    return isWeekend ? '19:00' : '18:00';
  }
}

// Controller
@ApiTags('TikTok')
@Controller('api/tiktok')
export class TikTokController {
  constructor(private service: TikTokService) {}

  @Get('topics')
  @ApiOperation({ summary: 'Get available script topics' })
  getTopics() { return this.service.getTopics(); }

  @Post('generate')
  @ApiOperation({ summary: 'Generate TikTok script' })
  generate(@Body() dto: GenerateScriptDto) { return this.service.generateScript(dto); }

  @Get('unpublished')
  @ApiOperation({ summary: 'Get unpublished scripts' })
  getUnpublished() { return this.service.getUnpublishedScripts(); }

  @Post('mark-published')
  @ApiOperation({ summary: 'Mark script as published' })
  markPublished(@Body() dto: MarkPublishedDto) { return this.service.markPublished(dto); }

  @Post(':contentId/metrics')
  @ApiOperation({ summary: 'Record TikTok metrics' })
  recordMetrics(@Param('contentId') contentId: string, @Body() metrics: { views: number; likes: number; shares: number; comments: number }) {
    return this.service.recordMetrics(contentId, metrics);
  }
}

@Module({
  controllers: [TikTokController],
  providers: [TikTokService, PrismaService],
  exports: [TikTokService],
})
export class TikTokModule {}
