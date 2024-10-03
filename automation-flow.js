require('dotenv').config();

const { VertexAI } = require('@google-cloud/vertexai');
const { google } = require('googleapis');
const path = require('path');

// Load environment variables
const PROJECT_ID = process.env.PROJECT_ID;
const KEY_FILE_PATH = process.env.KEY_FILE_PATH;
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const SHEET_ID = process.env.SHEET_ID;
const DOCS_FOLDER_ID = process.env.DOCS_FOLDER_ID;

/**
 * Authorizes the application using the Google Cloud key file.
 * @returns {Promise<OAuth2Client>} The authorized Google OAuth2 client.
 */
async function authorize() {
  console.log('Starting authorization process...');
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE_PATH,
      scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/docs', 'https://www.googleapis.com/auth/spreadsheets']
    });
    console.log(`Using key file: ${KEY_FILE_PATH}`);
    const client = await auth.getClient();
    console.log('Authorization successful. Client created.');
    return client;
  } catch (error) {
    console.error('Error during authorization:', error);
    throw error;
  }
}

/**
 * Retrieves a list of video recordings from the specified Google Drive folder.
 * @param {OAuth2Client} auth - The authorized Google OAuth2 client.
 * @returns {Promise<Array>} An array of file objects representing the recordings.
 */
async function getRecordings(auth) {
  const drive = google.drive({ version: 'v3', auth });
  console.log('Drive instance created');
  try {
    console.log('Attempting to list files...');
    const response = await drive.files.list({
      q: `'${DRIVE_FOLDER_ID}' in parents and mimeType contains 'video/' and trashed = false`,
      orderBy: 'createdTime desc',
      fields: 'files(id, name, createdTime, webViewLink)'
    });
    console.log('Files list retrieved successfully');
    return response.data.files;
  } catch (error) {
    console.error('Error in getRecordings:', error);
    return [];
  }
}

/**
 * Retrieves existing entries from the Google Sheet.
 * @param {OAuth2Client} auth - The authorized Google OAuth2 client.
 * @returns {Promise<Array>} An array of objects containing existing entries.
 */
async function getExistingEntries(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  try {
    console.log('Fetching existing entries from Google Sheet...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:D',
    });
    console.log('Existing entries fetched successfully');
    return response.data.values ? response.data.values.map(row => ({
      uniqueKey: `${row[0]}_${row[1]}T${row[2]}`,
      data: row
    })) : [];
  } catch (error) {
    console.error('Error getting existing entries:', error);
    return [];
  }
}

/**
 * Updates the Google Sheet with new entries.
 * @param {OAuth2Client} auth - The authorized Google OAuth2 client.
 * @param {Array} newEntries - An array of new entries to be added to the sheet.
 */
async function updateSheet(auth, newEntries) {
  const sheets = google.sheets({ version: 'v4', auth });
  
  try {
    console.log('Checking if the sheet is empty...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A1:D1',
    });

    let values = newEntries;

    if (!response.data.values || response.data.values.length === 0) {
      console.log('Sheet is empty. Adding headers.');
      values = [['title', 'date', 'time', 'meeting link'], ...newEntries];
    }

    if (values.length === 0) {
      console.log('No new entries to add to the sheet.');
      return;
    }

    console.log(`Appending ${values.length} entries to the sheet...`);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:D',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: values
      }
    });
    console.log(`Sheet updated successfully with ${values.length} entries (including headers if added).`);
  } catch (error) {
    console.error('Error updating sheet:', error);
  }
}

/**
 * Analyzes a video file using Vertex AI's Gemini model.
 * @param {OAuth2Client} auth - The authorized Google OAuth2 client.
 * @param {string} fileId - The ID of the video file in Google Drive.
 * @returns {Promise<string|null>} The generated summary or null if an error occurs.
 */
async function analyzeVideoWithAudio(auth, fileId) {
  console.log('Initializing Vertex AI...');
  const vertexAI = new VertexAI({project: PROJECT_ID, location: 'us-central1', keyFilename: process.env.KEY_FILE_PATH});
  const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-flash-002',
  });

  console.log('Preparing request...');
  const drive = google.drive({ version: 'v3', auth });
  const videoFile = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  const videoBuffer = Buffer.from(videoFile.data);

  const filePart = {
    inline_data: {
      data: videoBuffer.toString('base64'),
      mime_type: 'video/mp4',
    },
  };
  const textPart = {
    text: `
    Provide a summary of the video meeting.
    The summary should include:
    1. Main topics discussed
    2. Key decisions made
    3. Any important information shared during the meeting

    After the summary, please add a separate section titled "Action Items" that includes:
    - A list of specific tasks or next steps discussed in the meeting
    - Each action item should be written as a bullet point
    - Include the person responsible for each action item if mentioned
    - Add due dates for tasks if they were specified in the meeting`,
  };

  const request = {
    contents: [{role: 'user', parts: [filePart, textPart]}],
    generation_config: {
      max_output_tokens: 8192,
      temperature: 0.8,
    }
  };

  try {
    console.log('Sending request to Gemini API...');
    const resp = await generativeModel.generateContent(request);
    const contentResponse = await resp.response;
    console.log('Response received successfully from Gemini API.');
    return contentResponse.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error generating content:', error);
    return null;
  }
}

/**
 * Creates a new Google Doc with the provided content.
 * @param {OAuth2Client} auth - The authorized Google OAuth2 client.
 * @param {string} docName - The name for the new Google Doc.
 * @param {string} content - The content to be inserted into the Google Doc.
 * @returns {Promise<string|null>} The web view link of the created document, or null if an error occurs.
 */
async function createGoogleDoc(auth, docName, content) {
  const drive = google.drive({ version: 'v3', auth });
  const docs = google.docs({ version: 'v1', auth });

  try {
    console.log(`Creating Google Doc: ${docName}`);
    const docResponse = await docs.documents.create({
      requestBody: {
        title: docName,
      },
    });
    const docId = docResponse.data.documentId;

    console.log(`Inserting content into Google Doc: ${docId}`);
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: {
                index: 1,
              },
              text: content,
            },
          },
        ],
      },
    });

    console.log(`Moving Google Doc to folder: ${DOCS_FOLDER_ID}`);
    await drive.files.update({
      fileId: docId,
      addParents: DOCS_FOLDER_ID,
      fields: 'id, parents, webViewLink',
    });

    const file = await drive.files.get({
      fileId: docId,
      fields: 'webViewLink',
    });

    console.log(`Google Doc created and moved to the specified folder. Doc ID: ${docId}`);
    return file.data.webViewLink;
  } catch (error) {
    console.error('Error creating Google Doc:', error);
    return null;
  }
}

/**
 * Processes the retrieved recordings, updates the sheet, and generates summaries.
 * @param {OAuth2Client} auth - The authorized Google OAuth2 client.
 * @param {Array} recordings - An array of recording objects to process.
 */
async function processRecordings(auth, recordings) {
  console.log('Processing recordings...');
  const existingEntries = await getExistingEntries(auth);
  const existingKeys = new Set(existingEntries.map(entry => entry.uniqueKey));

  const newEntries = [];
  for (const recording of recordings) {
    const createdTime = new Date(recording.createdTime);
    const formattedDate = createdTime.toISOString().split('T')[0];
    const formattedTime = createdTime.toTimeString().split(' ')[0];
    const uniqueKey = `${recording.name}_${formattedDate}T${formattedTime}`;

    if (!existingKeys.has(uniqueKey)) {
      console.log(`New recording found: ${recording.name}`);
      newEntries.push([
        recording.name,
        formattedDate,
        formattedTime,
        recording.webViewLink
      ]);
    }
  }

  await updateSheet(auth, newEntries);

  if (recordings.length > 0) {
    const latestRecording = recordings[0];
    console.log(`Processing latest recording: ${latestRecording.name}`);
    const summary = await analyzeVideoWithAudio(auth, latestRecording.id);

    if (summary) {
      console.log('Video summary generated successfully.');
      const docUrl = await createGoogleDoc(auth, latestRecording.name, summary);
      if (docUrl) {
        console.log(`Summary saved to Google Doc. Access it here: ${docUrl}`);
      } else {
        console.log('Failed to save summary to Google Doc.');
      }
    } else {
      console.log('Failed to generate summary.');
      await createGoogleDoc(auth, latestRecording.name, "File is too big to process");
    }
  }
}

/**
 * Main function to orchestrate the entire process.
 */
async function main() {
  console.log('Main function started');
  try {
    const auth = await authorize();
    console.log('Authorization completed.');

    let recordings = await getRecordings(auth);
    console.log(`Found ${recordings.length} recordings.`);

    // Remove duplicate recordings based on their ID
    recordings = Array.from(new Set(recordings.map(r => r.id)))
      .map(id => recordings.find(r => r.id === id));

    if (recordings.length > 0) {
      await processRecordings(auth, recordings);
    } else {
      console.log('No recordings found. Exiting.');
    }

    console.log('Processing completed.');
  } catch (error) {
    console.error('An error occurred in the main function:', error);
  }
}

// Run the main function and handle any unhandled errors
main().catch(error => {
  console.error('An unhandled error occurred:', error);
  process.exit(1);
});

console.log('Script ended');