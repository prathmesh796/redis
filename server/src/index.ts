import express from 'express';
import { createClient } from 'redis';

const app = express();
app.use(express.json());

const port = 3000;
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

const redisClient = createClient({
  url: redisUrl,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: () => false,
  },
});

redisClient.on('connect', () => console.log('Connected to Redis'));
redisClient.on('error', (err) => {
  console.error(`Redis Client Error (${redisUrl})`, err instanceof Error ? err.message : err);
});

app.post('/lpush', async (req, res) => {
  try {
    console.log('Received data to push:', req.body);
    const data = JSON.stringify(req.body);
    if (!data) {      
      return res.status(400).json({ error: 'Data is required' });
    }
    await redisClient.LPUSH ('queue', data);
    res.json({ message: 'Value pushed to list successfully' });
  } catch (error) {
    console.error('Error pushing data to Redis', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const startServer = async () => {
  try {
    await redisClient.connect();
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error(`Unable to connect to Redis at ${redisUrl}. Start Redis first or set REDIS_URL.`);
    console.error(error);
    process.exit(1);
  }
};

startServer();