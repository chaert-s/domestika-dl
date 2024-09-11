# domestika-dl - A simple NodeJS solution for downloading Domestika Courses

This script is a simple way to download a full course from Domestika.

> **Warning**
> You must own the courses you wish to download. Courses downloaded via Domestica Plus do not contain the "Final project"

## Installation and usage

This script allows multiple courses to be downloaded at once. Paste all courses you want in a file named ```courses.txt``` in the root folder of this repo. Paste each course on a seperate line in this format:

https://www.domestika.org/en/courses/3086-creating-animated-stories-with-after-effects/course

IMPORTANT: you have to be on the "content" page of the course. You know you are on the right page when the URL ends with "/course".

Then, open the "index.js" file.

You will find the following variables:

```bash
  const subtitle_lang = 'en';
  const cookies;
  const _credentials_ = "";
```

To get the _domestika_session and the \_credentials_ you will need to install a chrome extension called Cookie-Editor.

After you installed the extension, log into domestika and open the extension.

In the window popup, look for "\_domestika_session", click to open it and copy the contents of the Value field into the value field under cookies.

Then look for the "_credentials_" cookie, copy the value of that into the "_credentials_" variable.

If you want to change the subtitles that will be downloaded, just put the preferred language into the "subtitle_lang" variable. But make sure the language is avaiable first.

Before you can start it, you have to download N_m3u8DL-RE from here: https://github.com/nilaoda/N_m3u8DL-RE/releases. Get the lasted version binary and place it in the folder. Make sure its named corretly ("N_m3u8DL-RE.exe").

Also be sure you have ffmpeg installed.

After you have done that, just open a terminal and type

```bash
npm i
```

After that to start the script type

```bash
npm run start .
```

All the courses will be downloaded in a folder called "domestika_courses/{coursename}/".

## Disclaimer

This project is for educational purposes only. The project is not responsible for any misuse of the software. Please check your local laws before using this software.
