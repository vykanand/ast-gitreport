// Function to send a question to external AI server
const askQuestion = async (question, session) => {
  console.log("Starting to process the question...");
  let requestBody;
  if (session) {
    requestBody = {
      aiquestion: question,
      sessionId: session,
    };
  } else {
    requestBody = { aiquestion: question };
  }
  try {
    const response = await fetch(
      "https://gitops-production.up.railway.app/aiserver",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(data);
    return data.response || data;
  } catch (error) {
    console.error(`Error with API request: ${error.message}`);
    throw error;
  }
};

// Function to chunk text into manageable sizes
const chunkText = (text, chunkSize) => {
  console.log("Chunking text...");
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  console.log("Text chunked into", chunks.length, "chunks.");
  return chunks;
};

// Process all text chunks and combine responses
const processChunks = async (chunks, sessionId, maxRetries = 3) => {
  console.log("Processing chunks...");
  const responses = new Array(chunks.length).fill(null);
  const totalChunks = chunks.length;

  for (let index = 0; index < chunks.length; index++) {
    console.log(`Processing chunk ${index + 1} of ${totalChunks}...`);
    let retries = 0;

    while (retries < maxRetries && responses[index] === null) {
      try {
        const response = await askQuestion(chunks[index], sessionId);
        responses[index] = response;
        const percentageCompleted = ((index + 1) / totalChunks) * 100;
        console.log(`Progress: ${percentageCompleted.toFixed(2)}% completed.`);
        break;
      } catch (error) {
        retries++;
        console.error(
          `Error processing chunk ${
            index + 1
          } (Attempt ${retries}/${maxRetries}): ${error.message}`
        );
        if (retries === maxRetries) {
          console.error(
            `Failed to process chunk ${index + 1} after ${maxRetries} attempts`
          );
        } else {
          console.log(`Retrying chunk ${index + 1} in 2 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  }

  console.log("All chunks processed.");
  return responses
    .filter((r) => r !== null)
    .join(" ")
    .trim();
};


// Main function to process HTML content
const processHtmlLLM = async (htmlContent, sessionId) => {
  console.log("Starting HTML processing...");

  console.log("Converting HTML to plain text...");
  const plainText = htmlContent
    .replace(/<\/?[^>]+>/gi, "")
    .replace(/&nbsp;/g, " ");
  console.log("HTML converted to plain text.");

  const tokenLimit = 20000;
  const chunkSize = Math.floor(tokenLimit * 0.95);
  console.log(`Chunking text into chunks of size ${chunkSize}...`);
  const chunks = chunkText(plainText, chunkSize);

  console.log("Processing chunks...");
  const finalResponse = await processChunks(chunks, sessionId);

  console.log("HTML processing completed check the results!");
  return finalResponse;
};

module.exports = {processHtmlLLM};
