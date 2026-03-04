import { Module, Controller, Get, Post, Put, Delete, Body, Param, Query, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEmail, IsBoolean } from 'class-validator';
import { PrismaService } from '../prisma.service';

// DTOs
export class CreateCompanyDto {
  @IsString() name: string;
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() status?: string;
}

export class CreateContactDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class CreateDealDto {
  @IsString() title: string;
  @IsNumber() value: number;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsNumber() probability?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateActivityDto {
  @IsString() type: string;
  @IsString() subject: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() outcome?: string;
}

// Service
@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: { status?: string; industry?: string; search?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.industry) where.industry = filters.industry;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.company.findMany({
      where,
      include: { contacts: true, deals: true, jobs: { where: { status: 'ACTIVE' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.company.findUnique({
      where: { id },
      include: { contacts: true, deals: true, jobs: true, activities: { take: 20, orderBy: { createdAt: 'desc' } } },
    });
  }

  async create(data: CreateCompanyDto) {
    return this.prisma.company.create({ data });
  }

  async update(id: string, data: Partial<CreateCompanyDto>) {
    return this.prisma.company.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.company.delete({ where: { id } });
  }

  async addContact(companyId: string, data: CreateContactDto) {
    return this.prisma.contact.create({ data: { ...data, companyId } });
  }

  async updateContact(contactId: string, data: Partial<CreateContactDto>) {
    return this.prisma.contact.update({ where: { id: contactId }, data });
  }

  async deleteContact(contactId: string) {
    return this.prisma.contact.delete({ where: { id: contactId } });
  }

  async addDeal(companyId: string, data: CreateDealDto) {
    return this.prisma.deal.create({ data: { ...data, companyId } });
  }

  async updateDeal(dealId: string, data: Partial<CreateDealDto>) {
    const updateData: any = { ...data };
    if (data.stage === 'CLOSED_WON' || data.stage === 'CLOSED_LOST') {
      updateData.actualCloseDate = new Date();
    }
    return this.prisma.deal.update({ where: { id: dealId }, data: updateData });
  }

  async addActivity(companyId: string, data: CreateActivityDto) {
    return this.prisma.activity.create({ data: { ...data, companyId } });
  }

  async getPipelineStats() {
    const deals = await this.prisma.deal.findMany();
    const stages = ['DISCOVERY', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];
    return {
      stages: stages.map(stage => ({
        stage,
        count: deals.filter(d => d.stage === stage).length,
        value: deals.filter(d => d.stage === stage).reduce((sum, d) => sum + d.value, 0),
      })),
      totalPipeline: deals.filter(d => !d.stage.includes('CLOSED')).reduce((sum, d) => sum + d.value, 0),
      wonValue: deals.filter(d => d.stage === 'CLOSED_WON').reduce((sum, d) => sum + d.value, 0),
    };
  }

  async getAtRiskAccounts() {
    return this.prisma.company.findMany({
      where: { status: 'ACTIVE', healthScore: { lt: 50 } },
      orderBy: { healthScore: 'asc' },
      take: 10,
    });
  }

  async getStats() {
    const [total, leads, active, totalRevenue] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { status: 'LEAD' } }),
      this.prisma.company.count({ where: { status: 'ACTIVE' } }),
      this.prisma.company.aggregate({ _sum: { totalRevenue: true } }),
    ]);
    return { total, leads, active, totalRevenue: totalRevenue._sum.totalRevenue || 0 };
  }
}

// Controller
@ApiTags('Companies')
@Controller('api/companies')
export class CompaniesController {
  constructor(private service: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'List all companies with filters' })
  findAll(@Query('status') status?: string, @Query('industry') industry?: string, @Query('search') search?: string) {
    return this.service.findAll({ status, industry, search });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get company statistics' })
  getStats() { return this.service.getStats(); }

  @Get('pipeline')
  @ApiOperation({ summary: 'Get sales pipeline stats' })
  getPipeline() { return this.service.getPipelineStats(); }

  @Get('at-risk')
  @ApiOperation({ summary: 'Get at-risk accounts' })
  getAtRisk() { return this.service.getAtRiskAccounts(); }

  @Get(':id')
  @ApiOperation({ summary: 'Get company by ID' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  @ApiOperation({ summary: 'Create company' })
  create(@Body() dto: CreateCompanyDto) { return this.service.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Update company' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateCompanyDto>) { return this.service.update(id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete company' })
  delete(@Param('id') id: string) { return this.service.delete(id); }

  @Post(':id/contacts')
  @ApiOperation({ summary: 'Add contact' })
  addContact(@Param('id') id: string, @Body() dto: CreateContactDto) { return this.service.addContact(id, dto); }

  @Put('contacts/:contactId')
  @ApiOperation({ summary: 'Update contact' })
  updateContact(@Param('contactId') contactId: string, @Body() dto: Partial<CreateContactDto>) { return this.service.updateContact(contactId, dto); }

  @Delete('contacts/:contactId')
  @ApiOperation({ summary: 'Delete contact' })
  deleteContact(@Param('contactId') contactId: string) { return this.service.deleteContact(contactId); }

  @Post(':id/deals')
  @ApiOperation({ summary: 'Add deal' })
  addDeal(@Param('id') id: string, @Body() dto: CreateDealDto) { return this.service.addDeal(id, dto); }

  @Put('deals/:dealId')
  @ApiOperation({ summary: 'Update deal' })
  updateDeal(@Param('dealId') dealId: string, @Body() dto: Partial<CreateDealDto>) { return this.service.updateDeal(dealId, dto); }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Log activity' })
  addActivity(@Param('id') id: string, @Body() dto: CreateActivityDto) { return this.service.addActivity(id, dto); }
}

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, PrismaService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
