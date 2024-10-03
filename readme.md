# AI-meeting-summarization-automation

This project automates the process of summarizing video recordings leveraging AI (model:gemini-1.5-flash-001)from Google Meet and organizing the information in Google Sheets and Google Docs.

# Features
This code automatically checks a specified Google Drive folder for new Google Meet recordings. 
When a new recording is found, the code will:

- Update a Google Sheet: Log details of all newly added recordings in your designated Google Sheet.
- Summarize with Gemini: Use Google's Gemini AI to summarize the most recent meeting recording.
- Create a Google Doc: Generate a Google Doc containing the AI summary of the meeting.
- Store the Google Doc: Save the summary document in your chosen Google Drive folder.

Summary contains
- Main topics discussed
- Key decisions made
- Any important information shared during the meeting
- Action items 
   - A list of specific tasks or next steps discussed in the meeting
   - Each action item should be written as a bullet point
   - Include the person responsible for each action item if mentioned




## Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js installed on your machine
- A Google Cloud Platform account with the following APIs enabled:
  - Google Drive API
  - Google Sheets API
  - Google Docs API
  - Vertex AI API
- A service account key file for authentication

## Installation

1. Clone this repository to your local machine.
2. Navigate to the project directory.
3. Run `npm install` to install the required dependencies.

## Configuration

1. Place your service account key file (JSON) in the project root directory.
2. Update the following constants in `automation_flow.js`:
   - `PROJECT_ID`: Your Google Cloud project ID
   - `KEY_FILE_PATH`: Path to your service account key file
   - `DRIVE_FOLDER_ID`: ID of the Google Drive folder containing the recordings
   - `SHEET_ID`: ID of the Google Sheet to update
   - `DOCS_FOLDER_ID`: ID of the Google Drive folder to store summary documents

## Usage

1. Ensure your environment is set up correctly:
   ```
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
   ```
2. Run the script:
   ```
   node automation_flow.js
   ```

The script will:
- Retrieve all video recordings from the specified Google Drive folder
- Update the Google Sheet with information about new recordings
- Generate a summary for the latest recording using the Gemini API
- Create a Google Doc with the summary and store it in the specified folder

## Troubleshooting

If you encounter any issues:
1. Check the console output for error messages
2. Ensure all required APIs are enabled in your Google Cloud project
3. Verify that your service account has the necessary permissions

## Contributing

Contributions to this project are welcome. Please ensure you follow the existing code style and add unit tests for any new features.

## License

[MIT License](https://opensource.org/licenses/MIT)

## Contact

If you have any questions or feedback, please contact the project maintainer at rachel880508@gmail.com
com].