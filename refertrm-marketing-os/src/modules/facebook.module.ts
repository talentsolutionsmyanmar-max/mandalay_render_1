import { Module, Controller, Get, Post, Body, Param, Query, Injectable, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';
import axios from 'axios';

// DTOs
export class PublishPostDto {
  @IsString() message: string;
  @IsOptional() @IsString() link?: string;
  @IsOptional() @IsArray() mediaUrls?: string[];
  @IsOptional() @IsString() scheduledTime?: string;
}

export class ReplyCommentDto {
  @IsString() commentId: string;
  @IsString() message: string;
  @IsOptional() @IsBoolean() sendDM?: boolean;
}

// Auto-response keywords
const AUTO_RESPONSES = {
  job: { keywords: ['job', 'jobs', 'hiring', 'vacancy', 'အလုပ်'], response: 'Browse jobs at refertrm.com/jobs 🎯' },
  info: { keywords: ['info', 'how', 'what', 'သိချင်'], response: 'Join our Telegram: t.me/referTRMMyanmar' },
  refer: { keywords: ['refer', 'referral', 'earn', 'ညွှန်း'], response: 'Earn rewards! refertrm.com/referrals 💰' },
};

// Service
@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly apiUrl = 'https://graph.facebook.com/v18.0';

  constructor(private config: ConfigService) {}

  private get token() { return this.config.get('FACEBOOK_PAGE_ACCESS_TOKEN'); }
  private get pageId() { return this.config.get('FACEBOOK_PAGE_ID'); }

  async publishPost(dto: PublishPostDto) {
    if (!this.token || !this.pageId) {
      return { success: false, error: 'Facebook not configured', mock: true, message: dto.message };
    }

    try {
      const payload: any = { message: dto.message, access_token: this.token };
      if (dto.link) payload.link = dto.link;
      if (dto.scheduledTime) {
        payload.published = false;
        payload.scheduled_publish_time = Math.floor(new Date(dto.scheduledTime).getTime() / 1000);
      }

      const response = await axios.post(`${this.apiUrl}/${this.pageId}/feed`, payload);
      this.logger.log(`Published post: ${response.data.id}`);
      return { success: true, postId: response.data.id };
    } catch (error: any) {
      this.logger.error('Failed to publish:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  async getPagePosts(limit: number = 10) {
    if (!this.token || !this.pageId) {
      return { success: false, error: 'Facebook not configured', mock: true, posts: [] };
    }

    try {
      const response = await axios.get(`${this.apiUrl}/${this.pageId}/posts`, {
        params: { access_token: this.token, limit, fields: 'id,message,created_time,shares,reactions.summary(true),comments.summary(true)' },
      });
      return { success: true, posts: response.data.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  async getPostComments(postId: string) {
    if (!this.token) return { success: false, error: 'Facebook not configured' };

    try {
      const response = await axios.get(`${this.apiUrl}/${postId}/comments`, {
        params: { access_token: this.token, fields: 'id,message,from,created_time' },
      });
      return { success: true, comments: response.data.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  async replyToComment(dto: ReplyCommentDto) {
    if (!this.token) return { success: false, error: 'Facebook not configured' };

    try {
      const response = await axios.post(`${this.apiUrl}/${dto.commentId}/comments`, {
        message: dto.message,
        access_token: this.token,
      });
      return { success: true, replyId: response.data.id };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  async getPageInsights() {
    if (!this.token || !this.pageId) return { success: false, error: 'Facebook not configured' };

    try {
      const response = await axios.get(`${this.apiUrl}/${this.pageId}/insights`, {
        params: {
          access_token: this.token,
          metric: 'page_impressions,page_engaged_users,page_fans,page_views_total',
          period: 'week',
        },
      });
      return { success: true, insights: response.data.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  // Webhook handling
  verifyWebhook(mode: string, token: string, challenge: string) {
    const verifyToken = this.config.get('FACEBOOK_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return null;
  }

  async handleWebhook(body: any) {
    if (body.object !== 'page') return;

    for (const entry of body.entry || []) {
      // Handle messages
      for (const event of entry.messaging || []) {
        if (event.message?.text) {
          await this.handleIncomingMessage(event.sender.id, event.message.text);
        }
      }

      // Handle comments
      for (const change of entry.changes || []) {
        if (change.field === 'feed' && change.value.item === 'comment') {
          await this.handleNewComment(change.value);
        }
      }
    }

    return { received: true };
  }

  private async handleIncomingMessage(senderId: string, text: string) {
    const lowerText = text.toLowerCase();
    for (const [key, config] of Object.entries(AUTO_RESPONSES)) {
      if (config.keywords.some(kw => lowerText.includes(kw))) {
        await this.sendMessage(senderId, config.response);
        return;
      }
    }
  }

  private async handleNewComment(comment: any) {
    const text = comment.message?.toLowerCase() || '';
    for (const [key, config] of Object.entries(AUTO_RESPONSES)) {
      if (config.keywords.some(kw => text.includes(kw))) {
        await this.replyToComment({ commentId: comment.comment_id, message: config.response });
        return;
      }
    }
  }

  private async sendMessage(recipientId: string, text: string) {
    if (!this.token) return;
    try {
      await axios.post(`${this.apiUrl}/me/messages`, {
        recipient: { id: recipientId },
        message: { text },
        access_token: this.token,
      });
    } catch (error) {
      this.logger.error('Failed to send message:', error);
    }
  }

  getConfig() {
    return {
      configured: !!(this.token && this.pageId),
      pageId: this.pageId || 'not set',
    };
  }
}

// Controller
@ApiTags('Facebook')
@Controller('api/facebook')
export class FacebookController {
  constructor(private service: FacebookService) {}

  @Get('config')
  @ApiOperation({ summary: 'Check Facebook configuration' })
  getConfig() { return this.service.getConfig(); }

  @Get('posts')
  @ApiOperation({ summary: 'Get page posts' })
  getPosts(@Query('limit') limit?: number) { return this.service.getPagePosts(limit); }

  @Post('posts')
  @ApiOperation({ summary: 'Publish a post' })
  publish(@Body() dto: PublishPostDto) { return this.service.publishPost(dto); }

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'Get post comments' })
  getComments(@Param('postId') postId: string) { return this.service.getPostComments(postId); }

  @Post('comments/reply')
  @ApiOperation({ summary: 'Reply to comment' })
  replyToComment(@Body() dto: ReplyCommentDto) { return this.service.replyToComment(dto); }

  @Get('insights')
  @ApiOperation({ summary: 'Get page insights' })
  getInsights() { return this.service.getPageInsights(); }

  @Get('webhook')
  @ApiOperation({ summary: 'Verify webhook' })
  verifyWebhook(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    const result = this.service.verifyWebhook(mode, token, challenge);
    return result || 'Verification failed';
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Handle webhook events' })
  handleWebhook(@Body() body: any) { return this.service.handleWebhook(body); }
}

@Module({
  controllers: [FacebookController],
  providers: [FacebookService],
  exports: [FacebookService],
})
export class FacebookModule {}
