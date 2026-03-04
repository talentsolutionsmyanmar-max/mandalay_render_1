import { Module, Controller, Get, Post, Put, Delete, Body, Param, Query, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsArray } from 'class-validator';
import { PrismaService } from '../prisma.service';

// DTOs
export class CreateJobDto {
  @IsString() title: string;
  @IsString() companyId: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() requirements?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() jobType?: string;
  @IsOptional() @IsString() experienceLevel?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() township?: string;
  @IsOptional() @IsBoolean() isRemote?: boolean;
  @IsOptional() @IsNumber() salaryMin?: number;
  @IsOptional() @IsNumber() salaryMax?: number;
  @IsOptional() @IsBoolean() showSalary?: boolean;
  @IsOptional() @IsNumber() referralBonus?: number;
  @IsOptional() @IsArray() requiredSkills?: string[];
  @IsOptional() @IsArray() preferredSkills?: string[];
}

export class CreateApplicationDto {
  @IsString() candidateId: string;
  @IsOptional() @IsString() coverLetter?: string;
  @IsOptional() @IsString() resumeUrl?: string;
  @IsOptional() @IsString() referralId?: string;
}

// Service
@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: { status?: string; companyId?: string; city?: string; jobType?: string; search?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.jobType) where.jobType = filters.jobType;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.job.findMany({
      where,
      include: { company: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      include: { company: true, applications: { include: { candidate: true } } },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.job.findUnique({
      where: { slug },
      include: { company: true },
    });
  }

  async create(data: CreateJobDto) {
    const slug = this.generateSlug(data.title);
    return this.prisma.job.create({ data: { ...data, slug } });
  }

  async update(id: string, data: Partial<CreateJobDto>) {
    return this.prisma.job.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.job.delete({ where: { id } });
  }

  async publish(id: string) {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'ACTIVE', publishedAt: new Date() },
    });
  }

  async pause(id: string) {
    return this.prisma.job.update({ where: { id }, data: { status: 'PAUSED' } });
  }

  async close(id: string) {
    return this.prisma.job.update({ where: { id }, data: { status: 'CLOSED' } });
  }

  // Applications
  async apply(jobId: string, data: CreateApplicationDto) {
    const existing = await this.prisma.application.findUnique({
      where: { candidateId_jobId: { candidateId: data.candidateId, jobId } },
    });
    if (existing) throw new Error('Already applied to this job');

    return this.prisma.application.create({
      data: { ...data, jobId },
    });
  }

  async getApplications(jobId: string) {
    return this.prisma.application.findMany({
      where: { jobId },
      include: { candidate: true },
      orderBy: { appliedAt: 'desc' },
    });
  }

  async updateApplicationStatus(applicationId: string, status: string) {
    const data: any = { status };
    if (status === 'SCREENING') data.screenedAt = new Date();
    if (status === 'INTERVIEW') data.interviewedAt = new Date();
    if (status === 'OFFER') data.offerDate = new Date();
    return this.prisma.application.update({ where: { id: applicationId }, data });
  }

  async getStats() {
    const [total, active, applications, hired] = await Promise.all([
      this.prisma.job.count(),
      this.prisma.job.count({ where: { status: 'ACTIVE' } }),
      this.prisma.application.count(),
      this.prisma.application.count({ where: { status: 'ACCEPTED' } }),
    ]);
    return { total, active, applications, hired };
  }

  async getPopularJobs(limit: number = 10) {
    return this.prisma.job.findMany({
      where: { status: 'ACTIVE' },
      include: { company: true, _count: { select: { applications: true } } },
      orderBy: { applications: { _count: 'desc' } },
      take: limit,
    });
  }

  private generateSlug(title: string): string {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const random = Math.random().toString(36).substring(2, 6);
    return `${base}-${random}`;
  }
}

// Controller
@ApiTags('Jobs')
@Controller('api/jobs')
export class JobsController {
  constructor(private service: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'List all jobs' })
  findAll(@Query('status') status?: string, @Query('companyId') companyId?: string, @Query('city') city?: string, @Query('jobType') jobType?: string, @Query('search') search?: string) {
    return this.service.findAll({ status, companyId, city, jobType, search });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get job statistics' })
  getStats() { return this.service.getStats(); }

  @Get('popular')
  @ApiOperation({ summary: 'Get popular jobs' })
  getPopular(@Query('limit') limit?: number) { return this.service.getPopularJobs(limit); }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get job by slug' })
  findBySlug(@Param('slug') slug: string) { return this.service.findBySlug(slug); }

  @Get(':id')
  @ApiOperation({ summary: 'Get job by ID' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  @ApiOperation({ summary: 'Create job' })
  create(@Body() dto: CreateJobDto) { return this.service.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Update job' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateJobDto>) { return this.service.update(id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete job' })
  delete(@Param('id') id: string) { return this.service.delete(id); }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish job' })
  publish(@Param('id') id: string) { return this.service.publish(id); }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause job' })
  pause(@Param('id') id: string) { return this.service.pause(id); }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close job' })
  close(@Param('id') id: string) { return this.service.close(id); }

  @Get(':id/applications')
  @ApiOperation({ summary: 'Get job applications' })
  getApplications(@Param('id') id: string) { return this.service.getApplications(id); }

  @Post(':id/apply')
  @ApiOperation({ summary: 'Apply to job' })
  apply(@Param('id') id: string, @Body() dto: CreateApplicationDto) { return this.service.apply(id, dto); }

  @Put('applications/:applicationId/status')
  @ApiOperation({ summary: 'Update application status' })
  updateApplicationStatus(@Param('applicationId') applicationId: string, @Body('status') status: string) {
    return this.service.updateApplicationStatus(applicationId, status);
  }
}

@Module({
  controllers: [JobsController],
  providers: [JobsService, PrismaService],
  exports: [JobsService],
})
export class JobsModule {}
