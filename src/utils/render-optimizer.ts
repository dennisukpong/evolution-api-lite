import { Logger } from '@nestjs/common';

export class RenderOptimizer {
  private static readonly logger = new Logger(RenderOptimizer.name);

  static optimizeForRender() {
    if (process.env.NODE_ENV === 'production') {
      this.logger.log('Applying Render.com optimizations...');
      
      // Optimize for Render's free tier
      this.applyMemoryOptimizations();
      this.applyTimeoutOptimizations();
      this.applyWebSocketOptimizations();
      
      this.logger.log('Render optimizations applied successfully');
    }
  }

  private static applyMemoryOptimizations() {
    // Reduce memory usage
    if (typeof global.gc !== 'undefined') {
      setInterval(() => {
        global.gc();
      }, 30000); // Run GC every 30 seconds
    }

    // Reduce session cache time
    process.env.SESSION_TIMEOUT = '600000'; // 10 minutes
  }

  private static applyTimeoutOptimizations() {
    // Increase timeouts for Render's cold starts
    process.env.WHATSAPP_TIMEOUT = '120000'; // 2 minutes
  }

  private static applyWebSocketOptimizations() {
    // Optimize WebSocket for Render's load balancer
    process.env.WS_PING_INTERVAL = '25000';
    process.env.WS_PING_TIMEOUT = '60000';
  }

  static getRenderInfo() {
    return {
      isRender: !!process.env.RENDER,
      serviceType: process.env.RENDER_SERVICE_TYPE,
      instanceId: process.env.RENDER_INSTANCE_ID,
      memoryLimit: process.env.RENDER_MEMORY_LIMIT,
      port: process.env.PORT
    };
  }
}