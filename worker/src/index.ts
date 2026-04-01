import { createClient } from 'redis';

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

async function executeWorker() {
    while (true) {
        try {
            const result = await redisClient.BRPOP('queue', 0);
            if (result) {
                const { key, element: data } = result;
                console.log('Processing data from queue:', JSON.parse(data));
            }
        } catch (error) {
            console.error('Error processing data from Redis', error);
        }
    }
}

const startWorker = async () => {
    try {
        await redisClient.connect();
        console.log(`Worker is running on http://localhost:${port}`);
        executeWorker();
    } catch (error) {
        console.error(`Unable to connect to Redis at ${redisUrl}. Start Redis first or set REDIS_URL.`);
        console.error(error);
        process.exit(1);
    }
};

startWorker();