import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Serve static files from public directory
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/',
  });
  
  // Health check endpoint for Render
  app.getHttpAdapter().getInstance().get('/api/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'evolution-api-lite',
      version: '1.0.0'
    });
  });

  // Enable CORS for web client
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Evolution API Lite running on port ${port}`);
  console.log(`🌐 Web client: http://0.0.0.0:${port}`);
  console.log(`🔌 WebSocket server ready`);
  console.log(`❤️  Health check: http://0.0.0.0:${port}/api/health`);
}
bootstrap();