// TypeScript
var ls=require( 'linkedin-profile-scraper');
 
// Plain Javascript
// const { LinkedInProfileScraper } = require('linkedin-profile-scraper')
 
(async() => {
  const scraper = new LinkedInProfileScraper({
    sessionCookieValue: 'LI_AT_COOKIE_VALUE',
    keepAlive: false
  });
 
  // Prepare the scraper
  // Loading it in memory
  await scraper.setup()
 
  const result = await scraper.run('https://www.linkedin.com/in/jvandenaardweg/')
  
  console.log(result)
})()