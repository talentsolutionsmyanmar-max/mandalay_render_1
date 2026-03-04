import { Module, Controller, Get, Post, Put, Delete, Body, Param, Query, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { PrismaService } from '../prisma.service';

// DTOs
export class CreateContentDto {
  @IsString() type: string;
  @IsString() title: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() excerpt?: string;
  @IsOptional() @IsArray() keywords?: string[];
  @IsOptional() @IsArray() platforms?: string[];
  @IsOptional() @IsString() featuredImage?: string;
}

export class GenerateContentDto {
  @IsString() type: string; // CASE_STUDY, ALUMNI_STORY, JOB_POST, EDUCATION
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() candidateId?: string;
  @IsOptional() @IsString() jobId?: string;
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsString() platform?: string; // FACEBOOK, LINKEDIN, TELEGRAM, TIKTOK
  @IsOptional() @IsString() tone?: string; // PROFESSIONAL, INSPIRING, EDUCATIONAL
  @IsOptional() @IsString() language?: string; // ENGLISH, BURMESE, MIXED
}

// AI Prompt Templates
const PROMPT_TEMPLATES = {
  CASE_STUDY: {
    system: `You are a B2B content strategist for referTRM, Myanmar's leading recruitment platform.
Create professional case studies that highlight client success stories.
Use mixed Burmese-English where natural. No emojis. Professional tone.
Structure: Hook → Challenge → Solution → Results → CTA`,
    template: `Create a case study for {{company_name}}, a {{industry}} company in Myanmar.
Challenge: {{challenge}}
Solution: referTRM {{solution_type}}
Results: {{results}}
Platform: {{platform}}`,
  },
  ALUMNI_STORY: {
    system: `You are a content creator for referTRM showcasing career transformation stories.
Write inspiring, authentic stories that motivate others.
Mix Burmese-English naturally. Emphasize community and gratitude.
Structure: Before → Discovery → Training → Success → Advice`,
    template: `Create a success story for {{candidate_name}}.
Before: {{previous_state}}
Training: {{cohort_name}}
After: {{current_role}} at {{company_name}}
Platform: {{platform}}`,
  },
  JOB_POST: {
    system: `You are a recruitment marketer creating engaging job posts.
Highlight key benefits and requirements clearly.
Adapt tone for each platform. Include referral bonus if applicable.`,
    template: `Create a job post for {{job_title}} at {{company_name}}.
Location: {{city}}
Type: {{job_type}}
Salary: {{salary_range}}
Referral Bonus: {{referral_bonus}}
Skills: {{required_skills}}
Platform: {{platform}}`,
  },
  EDUCATION: {
    system: `You are an educational content creator explaining referTRM features.
Make complex concepts simple and actionable.
Use examples relevant to Myanmar job market.`,
    template: `Create educational content about: {{topic}}
Audience: {{audience}} (B2B/B2C)
Platform: {{platform}}
Focus: {{focus_points}}`,
  },
};

// Service
@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: { type?: string; status?: string; platform?: string }) {
    const where: any = {};
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.platform) where.platforms = { has: filters.platform };
    return this.prisma.content.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.content.findUnique({ where: { id } });
  }

  async findBySlug(slug: string) {
    return this.prisma.content.findUnique({ where: { slug } });
  }

  async create(data: CreateContentDto) {
    const slug = this.generateSlug(data.title);
    return this.prisma.content.create({ data: { ...data, slug } });
  }

  async update(id: string, data: Partial<CreateContentDto>) {
    return this.prisma.content.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.content.delete({ where: { id } });
  }

  async publish(id: string) {
    return this.prisma.content.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  async schedule(id: string, scheduledFor: Date) {
    return this.prisma.content.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledFor },
    });
  }

  // AI Content Generation
  async generateContent(dto: GenerateContentDto) {
    const template = PROMPT_TEMPLATES[dto.type as keyof typeof PROMPT_TEMPLATES];
    if (!template) throw new Error(`Unknown content type: ${dto.type}`);

    // Build context based on type
    let context: any = {};

    if (dto.companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
      if (company) {
        context.company_name = company.name;
        context.industry = company.industry;
      }
    }

    if (dto.candidateId) {
      const candidate = await this.prisma.candidate.findUnique({
        where: { id: dto.candidateId },
        include: { applications: { where: { status: 'ACCEPTED' }, include: { job: { include: { company: true } } } } },
      });
      if (candidate) {
        context.candidate_name = `${candidate.firstName} ${candidate.lastName}`;
        const placement = candidate.applications[0];
        if (placement) {
          context.current_role = placement.job.title;
          context.company_name = placement.job.company.name;
        }
      }
    }

    if (dto.jobId) {
      const job = await this.prisma.job.findUnique({
        where: { id: dto.jobId },
        include: { company: true },
      });
      if (job) {
        context.job_title = job.title;
        context.company_name = job.company.name;
        context.city = job.city;
        context.job_type = job.jobType;
        context.salary_range = job.showSalary && job.salaryMin ? `K${job.salaryMin.toLocaleString()} - K${job.salaryMax?.toLocaleString()}` : 'Competitive';
        context.referral_bonus = job.referralBonus ? `K${job.referralBonus.toLocaleString()}` : 'N/A';
        context.required_skills = job.requiredSkills?.join(', ') || '';
      }
    }

    context.platform = dto.platform || 'FACEBOOK';
    context.topic = dto.topic || '';
    context.audience = dto.type === 'CASE_STUDY' ? 'B2B' : 'B2C';

    // Build prompt
    let prompt = template.template;
    Object.entries(context).forEach(([key, value]) => {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    });

    // Return prompt for AI processing (in production, call Claude API here)
    return {
      systemPrompt: template.system,
      userPrompt: prompt,
      context,
      type: dto.type,
      platform: dto.platform,
      // In production: actualContent: await this.callClaudeAPI(template.system, prompt)
    };
  }

  async generateCaseStudy(companyId: string, platform: string = 'LINKEDIN') {
    return this.generateContent({ type: 'CASE_STUDY', companyId, platform });
  }

  async generateAlumniStory(candidateId: string, platform: string = 'FACEBOOK') {
    return this.generateContent({ type: 'ALUMNI_STORY', candidateId, platform });
  }

  async generateJobPost(jobId: string, platform: string = 'FACEBOOK') {
    return this.generateContent({ type: 'JOB_POST', jobId, platform });
  }

  async getStats() {
    const [total, published, draft, scheduled] = await Promise.all([
      this.prisma.content.count(),
      this.prisma.content.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.content.count({ where: { status: 'DRAFT' } }),
      this.prisma.content.count({ where: { status: 'SCHEDULED' } }),
    ]);
    return { total, published, draft, scheduled };
  }

  async getContentIdeas() {
    // Get companies with high health scores for case studies
    const caseStudyCandidates = await this.prisma.company.findMany({
      where: { status: 'ACTIVE', healthScore: { gte: 70 } },
      take: 5,
      select: { id: true, name: true, industry: true },
    });

    // Get recently placed candidates for alumni stories
    const alumnistoryCandidates = await this.prisma.candidate.findMany({
      where: { status: 'PLACED' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, firstName: true, lastName: true },
    });

    // Get active jobs for job posts
    const jobPostCandidates = await this.prisma.job.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { company: { select: { name: true } } },
    });

    return {
      caseStudies: caseStudyCandidates.map(c => ({ id: c.id, title: `Case Study: ${c.name}`, type: 'CASE_STUDY' })),
      alumniStories: alumnistoryCandidates.map(c => ({ id: c.id, title: `Success Story: ${c.firstName} ${c.lastName}`, type: 'ALUMNI_STORY' })),
      jobPosts: jobPostCandidates.map(j => ({ id: j.id, title: `Job: ${j.title} at ${j.company.name}`, type: 'JOB_POST' })),
    };
  }

  private generateSlug(title: string): string {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const random = Math.random().toString(36).substring(2, 6);
    return `${base}-${random}`;
  }
}

// Controller
@ApiTags('Content')
@Controller('api/content')
export class ContentController {
  constructor(private service: ContentService) {}

  @Get()
  @ApiOperation({ summary: 'List all content' })
  findAll(@Query('type') type?: string, @Query('status') status?: string, @Query('platform') platform?: string) {
    return this.service.findAll({ type, status, platform });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get content statistics' })
  getStats() { return this.service.getStats(); }

  @Get('ideas')
  @ApiOperation({ summary: 'Get content ideas based on data' })
  getIdeas() { return this.service.getContentIdeas(); }

  @Get('templates')
  @ApiOperation({ summary: 'Get AI prompt templates' })
  getTemplates() { return Object.keys(PROMPT_TEMPLATES); }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get content by slug' })
  findBySlug(@Param('slug') slug: string) { return this.service.findBySlug(slug); }

  @Get(':id')
  @ApiOperation({ summary: 'Get content by ID' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  @ApiOperation({ summary: 'Create content' })
  create(@Body() dto: CreateContentDto) { return this.service.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Update content' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateContentDto>) { return this.service.update(id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete content' })
  delete(@Param('id') id: string) { return this.service.delete(id); }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish content' })
  publish(@Param('id') id: string) { return this.service.publish(id); }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule content' })
  schedule(@Param('id') id: string, @Body('scheduledFor') scheduledFor: string) {
    return this.service.schedule(id, new Date(scheduledFor));
  }

  // AI Generation Endpoints
  @Post('generate')
  @ApiOperation({ summary: 'Generate AI content' })
  generate(@Body() dto: GenerateContentDto) { return this.service.generateContent(dto); }

  @Post('generate/case-study/:companyId')
  @ApiOperation({ summary: 'Generate case study for company' })
  generateCaseStudy(@Param('companyId') companyId: string, @Query('platform') platform?: string) {
    return this.service.generateCaseStudy(companyId, platform);
  }

  @Post('generate/alumni-story/:candidateId')
  @ApiOperation({ summary: 'Generate alumni story' })
  generateAlumniStory(@Param('candidateId') candidateId: string, @Query('platform') platform?: string) {
    return this.service.generateAlumniStory(candidateId, platform);
  }

  @Post('generate/job-post/:jobId')
  @ApiOperation({ summary: 'Generate job post' })
  generateJobPost(@Param('jobId') jobId: string, @Query('platform') platform?: string) {
    return this.service.generateJobPost(jobId, platform);
  }
}

@Module({
  controllers: [ContentController],
  providers: [ContentService, PrismaService],
  exports: [ContentService],
})
export class ContentModule {}
