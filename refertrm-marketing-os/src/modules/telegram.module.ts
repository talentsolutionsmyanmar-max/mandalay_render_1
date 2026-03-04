import { Module, Controller, Get, Post, Body, Param, Query, Injectable, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IsString, IsOptional, IsArray } from 'class-validator';
import axios from 'axios';
import { PrismaService } from '../prisma.service';

// DTOs
export class BroadcastDto {
  @IsString() message: string;
  @IsOptional() @IsString() parseMode?: string;
  @IsOptional() @IsArray() buttons?: { text: string; url?: string; callback?: string }[][];
}

export class SendMessageDto {
  @IsString() chatId: string;
  @IsString() text: string;
  @IsOptional() @IsString() parseMode?: string;
}

// Bot Commands
const BOT_COMMANDS = [
  { command: 'start', description: 'Start / စတင်ရန်' },
  { command: 'jobs', description: 'Browse jobs / အလုပ်ရှာရန်' },
  { command: 'enroll', description: 'Join cohort / သင်တန်းလျှောက်ရန်' },
  { command: 'refer', description: 'Referral info / ညွှန်းပြနည်း' },
  { command: 'status', description: 'Check status / Status စစ်ရန်' },
  { command: 'help', description: 'Get help / အကူအညီ' },
];

// Daily Tips
const DAILY_TIPS = [
  '💡 LinkedIn profile ကို 100% complete ဖြစ်အောင်လုပ်ပါ။ Recruiters တွေက complete profile ကိုပဲ priority ပေးကြပါတယ်။',
  '💡 Interview မှာ "Tell me about yourself" မေးရင် 2 minutes အတွင်း ပြောပါ။',
  '💡 Resume မှာ action verbs သုံးပါ - "Managed", "Led", "Achieved" စသဖြင့်။',
  '💡 Salary negotiation မှာ range ပေးပါ။ Single number မပေးပါနဲ့။',
  '💡 Follow-up email ကို interview ပြီး 24 hours အတွင်း ပို့ပါ။',
];

// Service
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly apiUrl: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const token = this.config.get('TELEGRAM_BOT_TOKEN');
    this.apiUrl = token ? `https://api.telegram.org/bot${token}` : '';
  }

  private get channelId() { return this.config.get('TELEGRAM_CHANNEL_ID'); }
  private get isConfigured() { return !!this.apiUrl; }

  async sendMessage(chatId: string | number, text: string, options: any = {}) {
    if (!this.isConfigured) {
      return { success: false, error: 'Telegram not configured', mock: true };
    }

    try {
      const payload: any = { chat_id: chatId, text, parse_mode: options.parseMode || 'HTML' };
      if (options.replyMarkup) payload.reply_markup = options.replyMarkup;

      const response = await axios.post(`${this.apiUrl}/sendMessage`, payload);
      return { success: true, messageId: response.data.result.message_id };
    } catch (error: any) {
      this.logger.error('Send message failed:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.description || error.message };
    }
  }

  async broadcast(dto: BroadcastDto) {
    if (!this.channelId) {
      return { success: false, error: 'Channel ID not configured' };
    }

    const replyMarkup = dto.buttons ? {
      inline_keyboard: dto.buttons.map(row =>
        row.map(btn => ({
          text: btn.text,
          ...(btn.url && { url: btn.url }),
          ...(btn.callback && { callback_data: btn.callback }),
        }))
      ),
    } : undefined;

    return this.sendMessage(this.channelId, dto.message, {
      parseMode: dto.parseMode || 'HTML',
      replyMarkup,
    });
  }

  async broadcastJobPosting(job: any) {
    const message = `
<b>🆕 New Job Opening</b>

<b>${job.title}</b>
🏢 ${job.companyName}
📍 ${job.city}
💼 ${job.jobType}

${job.referralBonus ? `🎁 Referral Bonus: K ${job.referralBonus.toLocaleString()}` : ''}

Apply now on referTRM!
    `.trim();

    return this.broadcast({
      message,
      buttons: [[
        { text: '📝 Apply Now', url: `https://refertrm.com/jobs/${job.slug}` },
        { text: '🔗 Share', url: `https://t.me/share/url?url=https://refertrm.com/jobs/${job.slug}` },
      ]],
    });
  }

  async getMe() {
    if (!this.isConfigured) return { success: false, error: 'Telegram not configured' };
    try {
      const response = await axios.get(`${this.apiUrl}/getMe`);
      return { success: true, bot: response.data.result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async setWebhook(url: string) {
    if (!this.isConfigured) return { success: false, error: 'Telegram not configured' };
    try {
      const response = await axios.post(`${this.apiUrl}/setWebhook`, {
        url,
        allowed_updates: ['message', 'callback_query'],
        secret_token: this.config.get('TELEGRAM_WEBHOOK_SECRET'),
      });
      return { success: true, result: response.data.result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async handleWebhook(body: any) {
    if (body.message) {
      await this.handleMessage(body.message);
    } else if (body.callback_query) {
      await this.handleCallback(body.callback_query);
    }
    return { ok: true };
  }

  private async handleMessage(message: any) {
    const chatId = message.chat.id;
    const text = message.text || '';

    if (text.startsWith('/')) {
      const [command] = text.split(' ');
      await this.handleCommand(chatId, command.replace('/', '').split('@')[0]);
    }
  }

  private async handleCommand(chatId: number, command: string) {
    switch (command) {
      case 'start':
        await this.sendMessage(chatId, `
<b>🎉 Welcome to referTRM!</b>

Myanmar's leading career platform.

<b>What you can do:</b>
• 🔍 Find your dream job
• 📚 Build skills with free training
• 💰 Earn by referring friends

Use /help to see all commands.
        `, {
          replyMarkup: {
            inline_keyboard: [
              [{ text: '🔍 Browse Jobs', url: 'https://refertrm.com/jobs' }],
              [{ text: '📚 View Cohorts', url: 'https://refertrm.com/cohorts' }],
            ],
          },
        });
        break;

      case 'jobs':
        const jobs = await this.prisma.job.findMany({
          where: { status: 'ACTIVE' },
          include: { company: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        });

        let jobsMessage = '<b>🔍 Latest Jobs</b>\n\n';
        jobs.forEach((job, i) => {
          jobsMessage += `<b>${i + 1}. ${job.title}</b>\n`;
          jobsMessage += `   🏢 ${job.company.name} | 📍 ${job.city}\n\n`;
        });

        await this.sendMessage(chatId, jobsMessage || 'No jobs available right now.');
        break;

      case 'refer':
        await this.sendMessage(chatId, `
<b>🔗 Referral Program</b>

Refer friends and earn rewards!

<b>Reward Tiers:</b>
• Starter: K 150,000 per hire
• Bronze (3+): 1.1x bonus
• Silver (10+): 1.25x bonus
• Gold (25+): 1.5x bonus

Start at refertrm.com/referrals
        `);
        break;

      case 'help':
        const helpText = BOT_COMMANDS.map(c => `/${c.command} - ${c.description}`).join('\n');
        await this.sendMessage(chatId, `<b>❓ Commands</b>\n\n${helpText}`);
        break;

      default:
        await this.sendMessage(chatId, 'Use /help to see available commands.');
    }
  }

  private async handleCallback(callback: any) {
    const chatId = callback.message.chat.id;
    const data = callback.data;

    // Answer callback
    await axios.post(`${this.apiUrl}/answerCallbackQuery`, { callback_query_id: callback.id });

    // Handle callback data
    if (data === 'browse_jobs') {
      await this.handleCommand(chatId, 'jobs');
    }
  }

  getDailyTip() {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
  }

  getConfig() {
    return {
      configured: this.isConfigured,
      channelId: this.channelId || 'not set',
    };
  }
}

// Controller
@ApiTags('Telegram')
@Controller('api/telegram')
export class TelegramController {
  constructor(private service: TelegramService) {}

  @Get('config')
  @ApiOperation({ summary: 'Check Telegram configuration' })
  getConfig() { return this.service.getConfig(); }

  @Get('me')
  @ApiOperation({ summary: 'Get bot info' })
  getMe() { return this.service.getMe(); }

  @Post('webhook')
  @ApiOperation({ summary: 'Handle webhook' })
  handleWebhook(@Body() body: any) { return this.service.handleWebhook(body); }

  @Post('webhook/set')
  @ApiOperation({ summary: 'Set webhook URL' })
  setWebhook(@Body('url') url: string) { return this.service.setWebhook(url); }

  @Post('broadcast')
  @ApiOperation({ summary: 'Broadcast to channel' })
  broadcast(@Body() dto: BroadcastDto) { return this.service.broadcast(dto); }

  @Post('broadcast/job')
  @ApiOperation({ summary: 'Broadcast job posting' })
  broadcastJob(@Body() job: any) { return this.service.broadcastJobPosting(job); }

  @Post('message')
  @ApiOperation({ summary: 'Send message to chat' })
  sendMessage(@Body() dto: SendMessageDto) {
    return this.service.sendMessage(dto.chatId, dto.text, { parseMode: dto.parseMode });
  }

  @Get('daily-tip')
  @ApiOperation({ summary: 'Get daily career tip' })
  getDailyTip() { return { tip: this.service.getDailyTip() }; }
}

@Module({
  controllers: [TelegramController],
  providers: [TelegramService, PrismaService],
  exports: [TelegramService],
})
export class TelegramModule {}
