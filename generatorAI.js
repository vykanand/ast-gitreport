const { GoogleGenerativeAI } = require('@google/generative-ai');
const apiKeyLocal = require('./api_keys.js'); // Replace with secure API key management

const MAX_CONCURRENT_REQUESTS = 5; // Adjust based on your free tier limits

// Function to send a question to Gemini AI
const askQuestion = async (question, apiKey) => {
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const chat = model.startChat();
        const result = await chat.sendMessage(question);
        const responseText = await result.response.text();
        return responseText.trim();
    } catch (error) {
        console.error(`Error with API key ${apiKey}: ${error.message}`);
        throw new Error('API request failed');
    }
};

// Function to chunk text into manageable sizes
const chunkText = (text, chunkSize) => {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
};

// Process a chunk with a specific API key
const processChunk = async (chunk) => {
    let apiKey = apiKeyLocal[Math.floor(Math.random() * apiKeyLocal.length)];
    const response = await askQuestion(chunk, apiKey);
    return { response, apiKey }; // Return both the response and the API key used
};

// Main function to process HTML content
const processHtmlLLM = async (htmlContent) => {
    console.log('Starting HTML processing...');

    // Convert HTML to plain text
    console.log('Converting HTML to plain text...');
    const plainText = htmlContent
        .replace(/<\/?[^>]+>/gi, '') // Strip HTML tags
        .replace(/&nbsp;/g, ' '); // Replace non-breaking spaces with spaces
    console.log('HTML converted to plain text.');

    // Set chunk size based on known token limit
    const tokenLimit = 20000; // Example token limit
    const chunkSize = Math.floor(tokenLimit * 0.80); // Use 80% of token limit for safety
    const chunks = chunkText(plainText, chunkSize);
    console.log(`Text chunked into ${chunks.length} chunks of size up to ${chunkSize}.`);

    console.log('Processing chunks...');
    const combinedResponses = new Array(chunks.length); // Maintain order
    const chunkPromises = [];

    for (let i = 0; i < chunks.length; i++) {
        // If we've hit the max concurrent requests, wait for some to finish
        if (chunkPromises.length >= MAX_CONCURRENT_REQUESTS) {
            await Promise.race(chunkPromises); // Wait for any promise to resolve
        }

        const chunkIndex = i; // Keep the original index for ordering
        console.log(`Starting processing of chunk ${chunkIndex + 1}/${chunks.length}...`);

        const promise = processChunk(chunks[i])
            .then(({ response, apiKey }) => {
                combinedResponses[chunkIndex] = response; // Store response in correct order
                console.log(`Chunk ${chunkIndex + 1}/${chunks.length} processed successfully with API key: ${apiKey}.`);
            })
            .catch(error => {
                console.error(`Error processing chunk ${chunkIndex + 1}: ${error.message}`);
            });

        chunkPromises.push(promise);
    }

    // Wait for all remaining promises to finish
    await Promise.all(chunkPromises);
    console.log('All chunks processed.');

    const finalResponse = combinedResponses.join(' ').trim(); // Join in original order
    console.log('Final response assembled successfully.');
    return finalResponse;
};

module.exports = { processHtmlLLM };
