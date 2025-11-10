import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage } from '@nestjs/websocket';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private sessions: Map<string, string> = new Map();
  private qrStore: Map<string, any> = new Map();

  handleConnection(client: Socket) {
    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    const sessionId = this.sessions.get(client.id);
    if (sessionId) {
      console.log(`Client ${client.id} disconnected from session: ${sessionId}`);
      this.sessions.delete(client.id);
    }
  }

  @SubscribeMessage('join_session')
  handleJoinSession(client: Socket, sessionId: string) {
    client.join(sessionId);
    this.sessions.set(client.id, sessionId);
    
    console.log(`Client ${client.id} joined session: ${sessionId}`);
    
    client.emit('session_status', {
      sessionId,
      status: 'disconnected'
    });
  }

  @SubscribeMessage('init_session')
  handleInitSession(client: Socket, sessionId: string) {
    console.log(`Initializing session: ${sessionId}`);
    this.simulateQRGeneration(sessionId);
    
    client.emit('session_initialized', {
      sessionId,
      status: 'waiting_qr'
    });
  }

  @SubscribeMessage('get_qr')
  handleGetQR(client: Socket, sessionId: string) {
    const qrData = this.qrStore.get(sessionId);
    
    if (qrData) {
      client.emit('qr_generated', {
        sessionId,
        qr: qrData.qr,
        expiresAt: qrData.expiresAt
      });
    } else {
      client.emit('error', {
        sessionId,
        error: 'No QR code available'
      });
    }
  }

  @SubscribeMessage('logout_session')
  handleLogoutSession(client: Socket, sessionId: string) {
    console.log(`Logging out session: ${sessionId}`);
    this.qrStore.delete(sessionId);
    
    client.emit('session_logged_out', { sessionId });
    client.to(sessionId).emit('disconnected', { sessionId });
  }

  @SubscribeMessage('send_message')
  handleSendMessage(client: Socket, data: any) {
    const { sessionId, to, message } = data;
    
    console.log(`Sending message via session ${sessionId} to ${to}: ${message}`);
    
    const messageId = `msg_${Date.now()}`;
    
    client.emit('message_sent', {
      sessionId,
      messageId,
      status: 'sent'
    });
  }

  private async simulateQRGeneration(sessionId: string) {
    setTimeout(async () => {
      const QRCode = await import('qrcode');
      const qrData = `2@${Math.random().toString(36).substring(2)}${Date.now()}`;
      
      try {
        const qrImageUrl = await QRCode.toDataURL(qrData, {
          width: 300,
          height: 300,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });

        const qrDataObj = {
          qr: qrImageUrl,
          generatedAt: Date.now(),
          expiresAt: Date.now() + 120000
        };
        
        this.qrStore.set(sessionId, qrDataObj);

        this.server.to(sessionId).emit('qr_generated', {
          sessionId,
          qr: qrImageUrl,
          expiresAt: qrDataObj.expiresAt,
          message: 'Scan with WhatsApp within 2 minutes'
        });

        console.log(`QR generated for session: ${sessionId}`);

        setTimeout(() => {
          const currentQR = this.qrStore.get(sessionId);
          if (currentQR && currentQR.generatedAt === qrDataObj.generatedAt) {
            this.qrStore.delete(sessionId);
            console.log(`QR expired for session: ${sessionId}`);
          }
        }, 120000);

      } catch (error) {
        console.error('QR generation error:', error);
        this.server.to(sessionId).emit('error', {
          sessionId,
          error: 'QR generation failed'
        });
      }
    }, 1000);
  }
}