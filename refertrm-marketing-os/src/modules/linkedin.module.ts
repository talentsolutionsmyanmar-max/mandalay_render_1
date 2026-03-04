import { Module, Controller, Get, Post, Body, Param, Query, Injectable, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import axios from 'axios';

// DTOs
export class CreatePostDto {
  @IsString() text: string;
  @IsOptional() @IsString() articleUrl?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() visibility?: string;
}

export class PublishCaseStudyDto {
  @IsString() title: string;
  @IsString() excerpt: string;
  @IsString() url: string;
  @IsString() company: string;
  @IsOptional() @IsString() imageUrl?: string;
}

// Service
@Injectable()
export class LinkedInService {
  private readonly logger = new Logger(LinkedInService.name);
  private readonly apiUrl = 'https://api.linkedin.com/v2';

  constructor(private config: ConfigService) {}

  private get accessToken() { return this.config.get('LINKEDIN_ACCESS_TOKEN'); }
  private get organizationId() { return this.config.get('LINKEDIN_ORGANIZATION_ID'); }
  private get isConfigured() { return !!(this.accessToken && this.organizationId); }

  async createPost(dto: CreatePostDto) {
    if (!this.isConfigured) {
      return { success: false, error: 'LinkedIn not configured', mock: true };
    }

    try {
      const ownerUrn = `urn:li:organization:${this.organizationId}`;

      const payload: any = {
        author: ownerUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: dto.text },
            shareMediaCategory: dto.articleUrl ? 'ARTICLE' : 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': dto.visibility || 'PUBLIC',
        },
      };

      if (dto.articleUrl) {
        payload.specificContent['com.linkedin.ugc.ShareContent'].media = [{
          status: 'READY',
          originalUrl: dto.articleUrl,
        }];
      }

      const response = await axios.post(`${this.apiUrl}/ugcPosts`, payload, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      this.logger.log(`LinkedIn post created: ${response.data.id}`);
      return { success: true, postId: response.data.id };
    } catch (error: any) {
      this.logger.error('LinkedIn post failed:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  async publishCaseStudy(dto: PublishCaseStudyDto) {
    const text = `
📊 New Case Study: ${dto.title}

${dto.excerpt}

Learn how ${dto.company} transformed their recruitment process with referTRM.

Read the full case study: ${dto.url}

#MyanmarBusiness #Recruitment #HRTech #CaseStudy #referTRM
    `.trim();

    return this.createPost({ text, articleUrl: dto.url });
  }

  async publishJobOpening(job: { title: string; company: string; location: string; url: string; highlights: string[] }) {
    const highlightsText = job.highlights.map(h => `• ${h}`).join('\n');

    const text = `
🚀 We're Hiring: ${job.title}

${job.company} is looking for talented professionals to join their team in ${job.location}.

${highlightsText}

Apply now through referTRM: ${job.url}

Know someone perfect for this role? Our referral program offers rewards up to K500,000!

#MyanmarJobs #Hiring #CareerOpportunity #referTRM
    `.trim();

    return this.createPost({ text });
  }

  async getOrganization() {
    if (!this.isConfigured) return { success: false, error: 'LinkedIn not configured' };

    try {
      const response = await axios.get(`${this.apiUrl}/organizations/${this.organizationId}`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      });
      return { success: true, organization: response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  async getPosts(count: number = 10) {
    if (!this.isConfigured) return { success: false, error: 'LinkedIn not configured', posts: [] };

    try {
      const response = await axios.get(`${this.apiUrl}/ugcPosts`, {
        params: {
          q: 'authors',
          authors: `urn:li:organization:${this.organizationId}`,
          count,
        },
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      });
      return { success: true, posts: response.data.elements || [] };
    } catch (error: any) {
      return { success: false, error: error.message, posts: [] };
    }
  }

  getAuthUrl(state?: string) {
    const clientId = this.config.get('LINKEDIN_CLIENT_ID');
    const redirectUri = this.config.get('LINKEDIN_REDIRECT_URI');
    const scopes = ['r_liteprofile', 'r_organization_social', 'w_organization_social'].join(' ');

    return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri || '')}&scope=${encodeURIComponent(scopes)}${state ? `&state=${state}` : ''}`;
  }

  async exchangeCode(code: string) {
    const clientId = this.config.get('LINKEDIN_CLIENT_ID');
    const clientSecret = this.config.get('LINKEDIN_CLIENT_SECRET');
    const redirectUri = this.config.get('LINKEDIN_REDIRECT_URI');

    try {
      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
        params: {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        },
      });
      return { success: true, accessToken: response.data.access_token, expiresIn: response.data.expires_in };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error_description || error.message };
    }
  }

  getConfig() {
    return {
      configured: this.isConfigured,
      organizationId: this.organizationId || 'not set',
    };
  }
}

// Controller
@ApiTags('LinkedIn')
@Controller('api/linkedin')
export class LinkedInController {
  constructor(private service: LinkedInService) {}

  @Get('config')
  @ApiOperation({ summary: 'Check LinkedIn configuration' })
  getConfig() { return this.service.getConfig(); }

  @Get('auth')
  @ApiOperation({ summary: 'Get OAuth URL' })
  getAuthUrl(@Query('state') state?: string) {
    return { url: this.service.getAuthUrl(state) };
  }

  @Get('callback')
  @ApiOperation({ summary: 'OAuth callback' })
  callback(@Query('code') code: string) {
    return this.service.exchangeCode(code);
  }

  @Get('organization')
  @ApiOperation({ summary: 'Get organization info' })
  getOrganization() { return this.service.getOrganization(); }

  @Get('posts')
  @ApiOperation({ summary: 'Get organization posts' })
  getPosts(@Query('count') count?: number) { return this.service.getPosts(count); }

  @Post('posts')
  @ApiOperation({ summary: 'Create a post' })
  createPost(@Body() dto: CreatePostDto) { return this.service.createPost(dto); }

  @Post('posts/case-study')
  @ApiOperation({ summary: 'Publish case study' })
  publishCaseStudy(@Body() dto: PublishCaseStudyDto) { return this.service.publishCaseStudy(dto); }

  @Post('posts/job')
  @ApiOperation({ summary: 'Publish job opening' })
  publishJob(@Body() job: { title: string; company: string; location: string; url: string; highlights: string[] }) {
    return this.service.publishJobOpening(job);
  }
}

@Module({
  controllers: [LinkedInController],
  providers: [LinkedInService],
  exports: [LinkedInService],
})
export class LinkedInModule {}
