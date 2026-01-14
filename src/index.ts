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
