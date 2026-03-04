import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { CompaniesModule } from './modules/companies.module';
import { CandidatesModule } from './modules/candidates.module';
import { JobsModule } from './modules/jobs.module';
import { ReferralsModule } from './modules/referrals.module';
import { ContentModule } from './modules/content.module';
import { FacebookModule } from './modules/facebook.module';
import { TelegramModule } from './modules/telegram.module';
import { LinkedInModule } from './modules/linkedin.module';
import { TikTokModule } from './modules/tiktok.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    CompaniesModule,
    CandidatesModule,
    JobsModule,
    ReferralsModule,
    ContentModule,
    FacebookModule,
    TelegramModule,
    LinkedInModule,
    TikTokModule,
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
