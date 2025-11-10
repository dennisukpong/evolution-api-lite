import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage } from '@nestjs/websocket';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';

interface WhatsAppSession {
  sock: any;
  isConnected: boolean;
  user?: any;
  qr?: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})
export class EvolutionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EvolutionGateway.name);
  private sessions: Map<string, WhatsAppSession> = new Map();
  private socketSessions: Map<string, string> = new Map(); // socketId -> sessionId

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    const sessionId = this.socketSessions.get(client.id);
    if (sessionId) {
      this.logger.log(`Client ${client.id} disconnected from session: ${sessionId}`);
      this.socketSessions.delete(client.id);
    }
  }

  @SubscribeMessage('join_session')
  async handleJoinSession(client: Socket, sessionId: string) {
    client.join(sessionId);
    this.socketSessions.set(client.id, sessionId);
    
    this.logger.log(`Client ${client.id} joined session: ${sessionId}`);
    
    // Send current session status
    const session = this.sessions.get(sessionId);
    const status = session?.isConnected ? 'connected' : 'disconnected';
    
    client.emit('session_status', {
      sessionId,
      status,
      user: session?.user
    });

    // Send existing QR if available
    if (session?.qr) {
      client.emit('qr_generated', {
        sessionId,
        qr: session.qr,
        expiresAt: Date.now() + 120000
      });
    }
  }

  @SubscribeMessage('init_session')
  async handleInitSession(client: Socket, sessionId: string) {
    try {
      this.logger.log(`Initializing WhatsApp session: ${sessionId}`);
      
      if (this.sessions.has(sessionId)) {
        const existingSession = this.sessions.get(sessionId);
        if (existingSession?.isConnected) {
          client.emit('connected', {
            sessionId,
            user: existingSession.user,
            message: 'Session already connected'
          });
          return;
        }
      }

      // Initialize WhatsApp connection
      const { state, saveCreds } = await useMultiFileAuthState(
        path.join('sessions', sessionId)
      );

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: { level: 'silent' },
        browser: ['Evolution API Lite', 'Chrome', '121.0.0.0'],
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
      });

      const session: WhatsAppSession = {
        sock,
        isConnected: false
      };

      this.sessions.set(sessionId, session);

      // Setup event handlers
      sock.ev.on('connection.update', (update) => {
        this.handleConnectionUpdate(sessionId, update);
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('messages.upsert', (data) => {
        this.handleNewMessages(sessionId, data);
      });

      client.emit('session_initialized', {
        sessionId,
        status: 'waiting_qr'
      });

    } catch (error) {
      this.logger.error(`Session initialization failed: ${error.message}`);
      client.emit('error', {
        sessionId,
        error: 'Failed to initialize session'
      });
    }
  }

  private async handleConnectionUpdate(sessionId: string, update: any) {
    const { connection, qr, lastDisconnect } = update;
    const session = this.sessions.get(sessionId);

    if (qr) {
      this.logger.log(`QR generated for session: ${sessionId}`);
      
      try {
        const qrImageUrl = await QRCode.toDataURL(qr, {
          width: 300,
          height: 300,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });

        // Store QR in session
        if (session) {
          session.qr = qrImageUrl;
        }

        // Broadcast to all clients in session
        this.server.to(sessionId).emit('qr_generated', {
          sessionId,
          qr: qrImageUrl,
          expiresAt: Date.now() + 120000,
          message: 'Scan with WhatsApp within 2 minutes'
        });

      } catch (error) {
        this.logger.error(`QR generation failed: ${error.message}`);
        this.server.to(sessionId).emit('error', {
          sessionId,
          error: 'QR generation failed'
        });
      }
    }

    if (connection === 'open') {
      this.logger.log(`WhatsApp connected: ${sessionId}`);
      
      if (session) {
        session.isConnected = true;
        session.user = session.sock.user;
        session.qr = undefined; // Clear QR
      }

      this.server.to(sessionId).emit('connected', {
        sessionId,
        user: session.sock.user,
        message: 'WhatsApp successfully connected!'
      });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      this.logger.log(`WhatsApp disconnected: ${sessionId} (code: ${statusCode})`);
      
      if (session) {
        session.isConnected = false;
      }

      this.server.to(sessionId).emit('disconnected', {
        sessionId,
        reason: this.getDisconnectReason(statusCode)
      });

      // Auto-reconnect for non-logout disconnections
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(() => {
          this.logger.log(`Attempting to reconnect session: ${sessionId}`);
          // You could implement reconnection logic here
        }, 5000);
      }
    }
  }

  private handleNewMessages(sessionId: string, data: any) {
    data.messages.forEach(message => {
      if (message.key.fromMe) return; // Ignore own messages
      
      this.server.to(sessionId).emit('new_message', {
        sessionId,
        message: {
          from: message.key.remoteJid,
          text: message.message?.conversation || 
                message.message?.extendedTextMessage?.text ||
                'Media message',
          timestamp: message.messageTimestamp,
          id: message.key.id
        }
      });
    });
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(client: Socket, data: any) {
    const { sessionId, to, message } = data;
    
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.isConnected) {
        throw new Error('Session not connected');
      }

      const result = await session.sock.sendMessage(to, { text: message });
      
      client.emit('message_sent', {
        sessionId,
        messageId: result.key.id,
        status: 'sent',
        to,
        timestamp: new Date().toISOString()
      });

      this.logger.log(`Message sent via session ${sessionId} to ${to}`);

    } catch (error) {
      this.logger.error(`Message send failed: ${error.message}`);
      client.emit('error', {
        sessionId,
        error: `Failed to send message: ${error.message}`
      });
    }
  }

  @SubscribeMessage('get_sessions')
  handleGetSessions(client: Socket) {
    const sessions = Array.from(this.sessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      isConnected: session.isConnected,
      user: session.user
    }));

    client.emit('sessions_list', { sessions });
  }

  @SubscribeMessage('logout_session')
  async handleLogoutSession(client: Socket, sessionId: string) {
    try {
      const session = this.sessions.get(sessionId);
      if (session) {
        if (session.sock) {
          await session.sock.logout();
          session.sock.end();
        }
        this.sessions.delete(sessionId);
        
        // Cleanup session files
        this.cleanupSessionFiles(sessionId);
      }

      this.server.to(sessionId).emit('session_logged_out', { sessionId });
      this.logger.log(`Session logged out: ${sessionId}`);

    } catch (error) {
      this.logger.error(`Logout failed: ${error.message}`);
      client.emit('error', {
        sessionId,
        error: 'Logout failed'
      });
    }
  }

  private cleanupSessionFiles(sessionId: string) {
    const sessionPath = path.join('sessions', sessionId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
  }

  private getDisconnectReason(statusCode: number): string {
    const reasons = {
      [DisconnectReason.connectionClosed]: 'Connection closed',
      [DisconnectReason.connectionLost]: 'Connection lost',
      [DisconnectReason.connectionReplaced]: 'Connection replaced',
      [DisconnectReason.restartRequired]: 'Restart required',
      [DisconnectReason.timedOut]: 'Connection timed out',
    };
    return reasons[statusCode] || `Unknown reason (code: ${statusCode})`;
  }
}