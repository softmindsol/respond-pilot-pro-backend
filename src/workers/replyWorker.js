import ReplyQueue from '../models/queue.model.js';
import youtubeService from '../services/youtube.service.js';
import User from '../models/user.model.js';

// Configuration: 8 to 12 seconds randomized gap (to look natural)
const MIN_DELAY = 8000; 
const MAX_DELAY = 12000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const startReplyWorker = async () => {
    console.log("🚀 Serial Drip-Feed Worker Initialized...");

    const runWorker = async () => {
        try {
            // 1. Sirf AIK (1) pending job uthayein jo sabse purani ho
            const job = await ReplyQueue.findOne({ status: 'pending' }).sort({ createdAt: 1 });

            if (!job) {
                // Agar koi kaam nahi hai, toh 5 second baad check karein
                setTimeout(runWorker, 5000);
                return;
            }

            // 2. Mark as processing instantly to avoid other instances picking it
            job.status = 'processing';
            await job.save();

            console.log(`⏳ [Worker] Processing Comment ID: ${job.commentId}`);

            try {
                // 3. YouTube par reply post karein
                await youtubeService.postReplyToComment(job.userId, job.commentId, job.replyText);
                
                // Success updates
                job.status = 'completed';
                await job.save();
                
                // User credits update
                await User.findByIdAndUpdate(job.userId, { $inc: { repliesUsed: 1 } });
                
                console.log(`✅ [Worker] Posted successfully. Waiting for next drip...`);

            } catch (ytError) {
                console.error(`❌ [Worker] YouTube Error: ${ytError.message}`);

                if (ytError.message.includes('quotaExceeded')) {
                    console.log("⚠️ Quota hit! Pausing for 1 hour.");
                    job.status = 'pending'; 
                    await job.save();
                    setTimeout(runWorker, 3600000); 
                    return;
                }

                job.status = 'failed';
                job.error = ytError.message;
                await job.save();
            }

            // 4. 🔥 THE DRIP FEED: Wait before starting the next job
            const randomDelay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
            console.log(`😴 Sleeping for ${randomDelay / 1000} seconds...`);
            
            await sleep(randomDelay);
            
            // 5. Agla job shuru karein (Recursive call)
            runWorker();

        } catch (error) {
            console.error("🔥 Worker Crash Error:", error);
            setTimeout(runWorker, 10000); // 10s baad retry
        }
    };

    // Worker start karein
    runWorker();
};