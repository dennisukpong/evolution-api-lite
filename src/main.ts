import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { RenderOptimizer } from './utils/render-optimizer';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  // Apply Render optimizations
  RenderOptimizer.optimizeForRender();

  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Serve static files from public directory
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/',
  });
  
  // Health check endpoint for Render
  app.getHttpAdapter().getInstance().get('/api/health', (req, res) => {
    const renderInfo = RenderOptimizer.getRenderInfo();
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'evolution-api-lite',
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      render: renderInfo
    });
  });

  // Additional API info endpoint
  app.getHttpAdapter().getInstance().get('/api/info', (req, res) => {
    res.json({
      name: 'Evolution API Lite',
      version: '1.0.0',
      status: 'operational',
      features: ['WhatsApp Integration', 'WebSocket API', 'Web Dashboard'],
      endpoints: {
        health: '/api/health',
        websocket: '/socket.io',
        webClient: '/'
      }
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
  
  logger.log(`🚀 Evolution API Lite running on port ${port}`);
  logger.log(`🌐 Web client: http://0.0.0.0:${port}`);
  logger.log(`🔌 WebSocket server ready`);
  logger.log(`❤️  Health check: http://0.0.0.0:${port}/api/health`);
  logger.log(`📊 API info: http://0.0.0.0:${port}/api/info`);
  
  // Log Render-specific info
  const renderInfo = RenderOptimizer.getRenderInfo();
  if (renderInfo.isRender) {
    logger.log(`🏷️  Render.com deployment detected`);
    logger.log(`💾 Memory limit: ${renderInfo.memoryLimit || 'Unknown'}`);
    logger.log(`🔧 Service type: ${renderInfo.serviceType || 'Unknown'}`);
  }
}
bootstrap();