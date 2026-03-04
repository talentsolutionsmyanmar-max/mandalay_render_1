import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('referTRM Marketing OS')
    .setDescription('Full Marketing OS with AI Content Engine & Platform Integrations')
    .setVersion('2.0')
    .addTag('Companies', 'B2B CRM')
    .addTag('Candidates', 'B2C Platform')
    .addTag('Jobs', 'Marketplace')
    .addTag('Referrals', 'Referral System')
    .addTag('Content', 'AI Content Engine')
    .addTag('Facebook', 'Facebook Integration')
    .addTag('Telegram', 'Telegram Bot')
    .addTag('LinkedIn', 'LinkedIn Integration')
    .addTag('TikTok', 'TikTok Scripts')
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  app.getHttpAdapter().get('/api/health', (req, res) => {
    res.json({ status: 'healthy', version: '2.0.0', timestamp: new Date().toISOString() });
  });

  await app.listen(process.env.PORT || 4000);
  console.log(`🚀 referTRM Marketing OS running on port ${process.env.PORT || 4000}`);
}

bootstrap();
