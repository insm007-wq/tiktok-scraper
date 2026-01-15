import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import scrapeRouter from './routes/scrape';
import { errorHandler } from './middleware/errorHandler';
import { validateEnvironment } from './config/environment';

dotenv.config();

// Validate environment variables before starting
validateEnvironment();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// Debug: Apify API 토큰 검증
app.get('/debug/apify-token', async (req, res) => {
  const apiKey = process.env.APIFY_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      success: false,
      message: 'APIFY_API_KEY not configured',
      error: 'Missing environment variable',
    });
  }

  try {
    console.log('[Debug] Apify API 토큰 검증 시작...');
    console.log(`[Debug] 토큰 길이: ${apiKey.length}`);
    console.log(`[Debug] 토큰 첫 10자: ${apiKey.substring(0, 10)}***`);

    const response = await fetch(`https://api.apify.com/v2/users/me?token=${apiKey}`);
    const data = (await response.json()) as any;

    console.log(`[Debug] Apify API 응답 상태: ${response.status}`);

    if (!response.ok) {
      console.error('[Debug] Apify API 검증 실패:', data);
      return res.status(401).json({
        success: false,
        message: 'Apify API token is invalid',
        error: data.error,
        statusCode: response.status,
      });
    }

    console.log('[Debug] ✅ Apify API 토큰 유효!');
    return res.json({
      success: true,
      message: 'Apify API token is valid',
      user: {
        id: data.id,
        email: data.email,
        username: data.username,
      },
    });
  } catch (error) {
    console.error('[Debug] Apify API 토큰 검증 오류:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validating Apify API token',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Routes
app.use('/api', scrapeRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

// Error handling (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[Railway Server] ✓ Running on port ${PORT}`);
  console.log(`[Railway Server] Environment: ${process.env.NODE_ENV}`);
  console.log(`[Railway Server] Health check: GET /health`);
});
