const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const debug = false;
const debug_data = [];

const subtitle_lang = 'en';

// Cookie used to retrieve video information
const cookies = [
    {
        name: '_domestika_session',
        value: 'YOUR-COOKIE-HERE',
        domain: 'www.domestika.org',
    },
];

// Credentials needed for the access token to get the final project
const _credentials_ = 'VERIFICATION-HERE';
// --- END CONFIGURATION ---

// Check if the N_m3u8DL-RE.exe exists, throw error if not
if (!fs.existsSync('N_m3u8DL-RE.exe')) {
    throw Error('N_m3u8DL-RE.exe not found! Download the Binary here: https://github.com/nilaoda/N_m3u8DL-RE/releases');
}

const regex_token = /accessToken\":\"(.*?)\"/gm;
const access_token = regex_token.exec(decodeURI(_credentials_))[1];

/**
 * Scrapes a single course and downloads its videos sequentially.
 * @param {string} course_url - The URL of the course to download.
 */
async function scrapeSite(course_url) {
    // Scrape site for links to videos
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    await page.setCookie(...cookies);

    await page.setRequestInterception(true);

    page.on('request', (req) => {
        if (['stylesheet', 'font', 'image'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        await page.goto(course_url, { waitUntil: 'networkidle2' });
    } catch (err) {
        console.error(`Error navigating to ${course_url}: ${err}`);
        await page.close();
        await browser.close();
        return;
    }

    const html = await page.content();
    const $ = cheerio.load(html);

    console.log(`\nScraping Site: ${course_url}`);

    let allVideos = [];
    let units = $('h4.h2.unit-item__title a');
    let title = $('h1.course-header-new__title')
        .text()
        .trim()
        .replace(/[/\\?%*:|"<>]/g, '-');

    let totalVideos = 0;
    const regex_final = /courses\/(.*?)-*\/final_project/gm;

    // Apply regex to all units to get the final project
    let final_project_ids = units
        .map((i, element) => {
            let href = $(element).attr('href');
            let match = regex_final.exec(href);
            if (match) {
                return match[1].split('-')[0];
            } else {
                return null;
            }
        })
        .get()
        .filter(id => id !== null);

    // Remove final project from the units
    units = units.filter((i, element) => {
        let href = $(element).attr('href');
        let match = regex_final.exec(href);
        return !match;
    });

    console.log(`${units.length} Units Detected`);

    // Get all the links to the m3u8 files
    for (let i = 0; i < units.length; i++) {
        let unit_url = $(units[i]).attr('href');
        let videoData = await getInitialProps(unit_url, page);

        if (videoData.length > 0) {
            allVideos.push({
                title: $(units[i])
                    .text()
                    .replaceAll('.', '')
                    .trim()
                    .replace(/[/\\?%*:|"<>]/g, '-'),
                videoData: videoData,
            });

            totalVideos += videoData.length;
        }
    }

    console.log('All Videos Found');

    // Handle final projects if any
    for (const final_project_id of final_project_ids) {
        console.log('Fetching Final Project');
        let final_data = await fetchFromApi(`https://api.domestika.org/api/courses/${final_project_id}/final-project?with_server_timing=true`, 'finalProject.v1', access_token);

        if (final_data && final_data.data) {
            let final_video_data = final_data.data.relationships;
            if (final_video_data && final_video_data.video && final_video_data.video.data) {
                const final_video_id = final_video_data.video.data.id;
                final_data = await fetchFromApi(`https://api.domestika.org/api/videos/${final_video_id}?with_server_timing=true`, 'video.v1', access_token);

                if (final_data && final_data.data && final_data.data.attributes && final_data.data.attributes.playbackUrl) {
                    allVideos.push({
                        title: 'Final project',
                        videoData: [{ playbackURL: final_data.data.attributes.playbackUrl, title: 'Final project', section: 'Final project' }],
                    });

                    totalVideos += 1;
                }
            }
        }
    }

    if (allVideos.length === 0) {
        console.log('No videos found for this course.');
    } else {
        let count = 0;
        for (let i = 0; i < allVideos.length; i++) {
            const unit = allVideos[i];
            for (let a = 0; a < unit.videoData.length; a++) {
                const vData = unit.videoData[a];
                // Sequential download (await each download)
                await downloadVideo(vData, title, unit.title, a);

                count++;
                console.log(`Download ${count}/${totalVideos} Completed`);
            }
        }
    }

    await page.close();
    await browser.close();

    if (debug) {
        fs.writeFileSync('log.json', JSON.stringify(debug_data, null, 2));
        console.log('Log File Saved');
    }

    console.log(`All Videos Downloaded for course: ${course_url}`);
}

/**
 * Extracts video data from a unit page.
 * @param {string} url - The URL of the unit.
 * @param {object} page - The Puppeteer page instance.
 * @returns {Array} - An array of video data objects.
 */
async function getInitialProps(url, page) {
    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
    } catch (err) {
        console.error(`Error navigating to ${url}: ${err}`);
        return [];
    }

    const data = await page.evaluate(() => window.__INITIAL_PROPS__);
    const html = await page.content();
    const $ = cheerio.load(html);

    let section = $('h2.h3.course-header-new__subtitle')
        .text()
        .trim()
        .replace(/[/\\?%*:|"<>]/g, '-');

    let videoData = [];

    if (data && data.videos && data.videos.length > 0) {
        for (let i = 0; i < data.videos.length; i++) {
            const el = data.videos[i];

            videoData.push({
                playbackURL: el.video.playbackURL,
                title: el.video.title.replaceAll('.', '').trim(),
                section: section,
            });

            console.log('Video Found: ' + el.video.title);
        }
    }

    return videoData;
}

/**
 * Fetches data from the Domestika API.
 * @param {string} apiURL - The API endpoint URL.
 * @param {string} accept_version - The API version to accept.
 * @param {string} access_token - The access token for authentication.
 * @returns {object|boolean} - The fetched data or false on failure.
 */
async function fetchFromApi(apiURL, accept_version, access_token) {
    try {
        const response = await fetch(apiURL, {
            method: 'get',
            headers: {
                Authorization: `Bearer ${access_token}`,
                Accept: 'application/vnd.api+json',
                'Content-Type': 'application/vnd.api+json',
                'x-dmstk-accept-version': accept_version,
            },
        });

        if (!response.ok) {
            console.log('Error Fetching Data, check the credentials are still valid.');
            return false;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.log(error);
        return false;
    }
}

/**
 * Downloads a single video using N_m3u8DL-RE.
 * @param {object} vData - The video data object.
 * @param {string} title - The course title.
 * @param {string} unitTitle - The unit title.
 * @param {number} index - The index of the video.
 */
async function downloadVideo(vData, title, unitTitle, index) {
    try {
        const saveDir = path.join('domestika_courses', title, vData.section, unitTitle);
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        const options = { maxBuffer: 1024 * 1024 * 10 };

        const saveName = `${index + 1}_${vData.title.trimEnd()}`;

        console.log(`Starting download: ${saveName}`);

        // Download the video stream
        let log = await exec(`N_m3u8DL-RE -sv res="1080*":codec=hvc1:for=best "${vData.playbackURL}" --save-dir "${saveDir}" --save-name "${saveName}"`, options);
        
        // Download the subtitles
        let log2 = await exec(`N_m3u8DL-RE --auto-subtitle-fix --sub-format SRT --select-subtitle lang="${subtitle_lang}":for=all "${vData.playbackURL}" --save-dir "${saveDir}" --save-name "${saveName}"`, options);

        if (debug) {
            debug_data.push({
                videoURL: vData.playbackURL,
                output: [log.stdout, log2.stdout],
            });
        }

        console.log(`Downloaded: ${saveName}`);
    } catch (error) {
        console.error(`Error downloading video "${vData.title}": ${error}`);
    }
}

/**
 * Main function to process multiple courses.
 */
async function main() {
    let course_urls = [];

    // Implementation A: Define the URLs in an array (old)
    /*
    course_urls = [
        'https://www.domestika.org/en/courses/1234-course-title',
        'https://www.domestika.org/en/courses/5678-another-course',
        // Add more URLs here
    ];
    */

    // Implementation B: Read URLs from a file (courses.txt, one URL per line)
    const coursesFile = 'courses.txt';
    if (fs.existsSync(coursesFile)) {
        const fileContent = fs.readFileSync(coursesFile, 'utf-8');
        course_urls = fileContent.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    } else {
        console.error(`Courses file not found: ${coursesFile}`);
        console.error('Please create a "courses.txt" file with one course URL per line or define the URLs in the script.');
        return;
    }

    console.log(`Found ${course_urls.length} courses to download.`);

    for (let i = 0; i < course_urls.length; i++) {
        const course_url = course_urls[i];
        console.log(`\n=== Starting download for course ${i + 1}/${course_urls.length}: ${course_url} ===`);

        try {
            await scrapeSite(course_url);
        } catch (err) {
            console.error(`Error processing course ${course_url}: ${err}`);
        }

        console.log(`=== Finished download for course ${i + 1}/${course_urls.length}: ${course_url} ===\n`);
    }

    console.log('All courses downloaded.');
}

main();
