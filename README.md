

---

# Personal Tracker Web Application

**Personal Tracker** is a simple yet powerful web-based application that allows users to track events, salaries, and milk consumption. The app ensures user data persistence across sessions with local storage, and provides an option to export and import data to handle potential loss due to cache clearing.

## Live Demo

A demo of the app is available [here](https://rahul-art-create.github.io/Tracker.by.rahul/).


## Key Features

1. **Event Tracker**
   - Add events (e.g., birthdays, anniversaries) with names, types, and dates.
   - Mark events as celebrated or delete them.
   - Get reminders for upcoming events, with a snooze option.

2. **Salary Tracker**
   - Record salary details by entering the student's name, salary amount, and the respective month.
   - View, edit, or delete salary entries.

3. **Milk Consumption Calendar**
   - Track daily milk consumption in a calendar view.
   - Analyze milk consumption over a specific date range.
   - Customize milk quantities and their respective prices.

4. **PDF Export**
   - Export event, salary, and milk consumption data into a PDF file for backup or offline usage.

5. **Upload & Download Data**
   - **Download Data**: Save all event, salary, and milk consumption data into a JSON file. This allows you to back up your data before clearing your cache.
   - **Upload Data**: Restore data by uploading a previously downloaded JSON file. This ensures that users can easily retrieve their information after clearing cache or using the app across multiple devices.

## Purpose of the Upload & Download Buttons

The upload and download functionality was introduced to prevent the loss of data due to cache clearing. Since the app uses browser-based local storage, data can be lost if the cache is cleared, or when accessing the app from a new device or browser. To mitigate this:

- **Download Data** allows users to save all tracked data (events, salaries, milk consumption) to a JSON file. This file can be stored locally or on external storage for safekeeping.
- **Upload Data** enables users to restore their saved data by importing the previously downloaded JSON file, ensuring continuity even after cache clearance or switching devices.

This mechanism provides users with control over their data, ensuring that important information isn't lost due to technical issues or browser behavior.

## How to Use

### Adding Events
- Fill in the event name, type (e.g., Birthday), and date.
- Click the **Add Event** button to save it.
- Events for the current day will trigger reminders with options to dismiss or snooze.

### Tracking Salaries
- Enter the student’s name, salary amount, and select the month.
- Click the **Add Salary** button to log the information.
- View, edit, or remove salary entries for any month.

### Monitoring Milk Consumption
- Navigate through the calendar to mark daily milk consumption.
- Analyze consumption data for a specific range of dates by selecting a start and end date.

### Exporting Data to PDF
- Click the **Export to PDF** button to generate a PDF file containing your event, salary, and milk consumption records.

### Downloading and Uploading Data
- **Download Data**: Click the **Download Data** button to save your current data as a JSON file.
- **Upload Data**: Click the **Upload Data** button to restore data from a previously saved JSON file.

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Libraries**:
  - [jsPDF](https://github.com/parallax/jsPDF) for PDF export
  - [jsPDF AutoTable Plugin](https://github.com/simonbengtsson/jsPDF-AutoTable) for table generation in PDFs
- **LocalStorage**: Used for persistent data storage.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/personal-tracker.git
   ```
2. Open the `index.html` file in your web browser.

---

This README file explains the primary goal of data protection via upload/download options, ensuring users have a backup before clearing cache or switching devices.
