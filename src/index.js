require('dotenv').config();
const { startBot } = require('./bot');

console.log('Starting Discord Minecraft Account Recovery Bot...');

// Start Discord bot
startBot().then(() => {
  console.log('Discord bot started successfully');
}).catch(err => {
  console.error('Failed to start Discord bot:', err);
  process.exit(1);
});
