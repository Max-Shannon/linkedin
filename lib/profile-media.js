const fs = require('fs');
const path = require('path');

function createImageResponseCache(page) {
  const cache = new Map();

  const handler = async (response) => {
    const url = response.url();
    if (!response.ok() || !/licdn|media\.linkedin/i.test(url)) {
      return;
    }
    if (!/profile-displayphoto|displaybackground|backgroundimage|profile-displaybackground/i.test(url)) {
      return;
    }
    try {
      const buffer = await response.buffer();
      cache.set(url, buffer);
    } catch (err) {
      // Response body may already be consumed.
    }
  };

  page.on('response', handler);

  return {
    get(url) {
      return cache.get(url) || null;
    },
    findBest(url) {
      if (!url) {
        return null;
      }
      const direct = cache.get(url);
      if (direct) {
        return direct;
      }
      const assetKey = imageAssetKey(url);
      let best = null;
      let bestScore = -1;
      for (const [cachedUrl, buffer] of cache.entries()) {
        if (imageAssetKey(cachedUrl) !== assetKey) {
          continue;
        }
        const score = scoreImageUrl(cachedUrl);
        if (score > bestScore) {
          bestScore = score;
          best = buffer;
        }
      }
      return best;
    },
    detach() {
      page.off('response', handler);
    },
  };
}

function imageAssetKey(url) {
  const match = String(url).match(/\/dms\/image\/v2\/([^/]+)\//i);
  return match?.[1] || String(url).split('?')[0];
}

const PROFILE_PHOTO_OPEN_SELECTORS = [
  'button.pv-top-card-profile-picture__container',
  'button.pv-top-card-profile-picture',
  'button[aria-label*="profile photo" i]',
  'button[aria-label*="Profile photo" i]',
  'button[aria-label*="View profile photo" i]',
  '.pv-top-card-profile-picture img',
  'img.pv-top-card-profile-picture__image',
  'img.pv-top-card-profile-picture__image--show',
];

const BACKGROUND_OPEN_SELECTORS = [
  'button[aria-label*="background" i]',
  'button[aria-label*="cover photo" i]',
  'button[aria-label*="Cover photo" i]',
  '.profile-background-image img',
  'img.profile-background-image',
  '.pv-top-card-background-image img',
  '.profile-background-image',
  '.pv-top-card-background-image',
];

function upsizeLinkedInImageUrl(url) {
  if (!url) {
    return null;
  }

  return url
    .replace(/profile-displayphoto-shrink_\d+_\d+/gi, 'profile-displayphoto-shrink_800_800')
    .replace(/profile-displayphoto-scale_\d+_\d+/gi, 'profile-displayphoto-scale_800_800')
    .replace(/profile-displaybackgroundimage-shrink_\d+_\d+/gi, 'profile-displaybackgroundimage-shrink_2000_2000')
    .replace(/(_\d{2,4})_(\d{2,4})(?=\/|$|\?)/g, (match, w, h) => {
      if (Number(w.replace('_', '')) <= 200) {
        return '_800_800';
      }
      return match;
    });
}

function extensionFromUrl(url, fallback = 'jpg') {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).replace('.', '').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  } catch (err) {
    // ignore invalid URL
  }
  return fallback;
}

function pickBestUrl(...candidates) {
  const unique = [...new Set(candidates.filter(Boolean))];
  if (unique.length === 0) {
    return null;
  }

  return unique.sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a))[0];
}

function scoreImageUrl(url) {
  const sizeMatches = [...url.matchAll(/(\d{3,4})[_x](\d{3,4})/g)];
  if (sizeMatches.length === 0) {
    return url.includes('800') ? 800 : url.includes('400') ? 400 : 100;
  }
  const last = sizeMatches[sizeMatches.length - 1];
  return Number(last[1]) * Number(last[2]);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeModal(page) {
  const dismiss = await page.$('button.artdeco-modal__dismiss, button[aria-label="Dismiss"]');
  if (dismiss) {
    await dismiss.click().catch(() => {});
    await sleep(250);
    return;
  }
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(250);
}

async function extractModalImageUrl(page) {
  return page.evaluate(() => {
    const modal =
      document.querySelector('.artdeco-modal') ||
      document.querySelector('[role="dialog"]');
    if (!modal) {
      return null;
    }

    const title = modal.querySelector('h2, h1')?.innerText?.trim() || '';
    const images = [...modal.querySelectorAll('img')]
      .map((img) => ({
        src: img.currentSrc || img.src || '',
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        alt: img.alt || '',
      }))
      .filter((row) => row.src && !row.src.startsWith('data:'))
      .sort((a, b) => b.width * b.height - a.width * a.height);

    let url = images[0]?.src || null;
    if (!url) {
      for (const node of modal.querySelectorAll('*')) {
        const match = window
          .getComputedStyle(node)
          .backgroundImage.match(/url\(["']?(.*?)["']?\)/i);
        if (match?.[1] && /licdn|media\.linkedin/i.test(match[1])) {
          url = match[1];
          break;
        }
      }
    }

    return {
      title,
      url,
      width: images[0]?.width || null,
      height: images[0]?.height || null,
    };
  });
}

async function clickFirstVisible(page, selectors, kind) {
  for (const selector of selectors) {
    const handle = await page.$(selector);
    if (!handle) {
      continue;
    }
    const box = await handle.boundingBox();
    if (!box || box.width < 8 || box.height < 8) {
      continue;
    }
    await handle.click({ delay: 20 });
    return selector;
  }

  const evaluated = await page.evaluate((photoKind) => {
    const buttons = [...document.querySelectorAll('button')];
    const labelPattern =
      photoKind === 'background-photo'
        ? /cover photo|background photo|background image/i
        : /profile photo|view profile photo/i;
    const matchedBtn = buttons.find((btn) =>
      labelPattern.test(btn.getAttribute('aria-label') || '')
    );
    if (matchedBtn) {
      matchedBtn.click();
      return matchedBtn.getAttribute('aria-label') || 'button[aria-label]';
    }

    if (photoKind === 'profile-photo') {
      const topCard =
        document.querySelector('.pv-top-card') ||
        document.querySelector('section.artdeco-card') ||
        document.querySelector('main');
      const img =
        topCard?.querySelector('img.pv-top-card-profile-picture__image') ||
        topCard?.querySelector('.pv-top-card-profile-picture img') ||
        topCard?.querySelector('img[src*="profile-displayphoto"]');
      const imgButton = img?.closest('button');
      if (imgButton) {
        imgButton.click();
        return 'button:has(profile-picture img)';
      }
      if (img) {
        img.click();
        return 'img[profile-displayphoto]';
      }
      return null;
    }

    const bgImg =
      document.querySelector('img.profile-background-image') ||
      document.querySelector('.profile-background-image img');
    const bgButton = bgImg?.closest('button');
    if (bgButton) {
      bgButton.click();
      return 'button:has(background img)';
    }
    bgImg?.click();
    return bgImg ? 'img.profile-background-image' : null;
  }, kind);

  return evaluated;
}

async function waitForModalImage(page) {
  try {
    await page.waitForFunction(
      () => {
        const modal =
          document.querySelector('.artdeco-modal') ||
          document.querySelector('[role="dialog"]');
        if (!modal) {
          return false;
        }
        const img = [...modal.querySelectorAll('img')].find(
          (node) => node.src && !node.src.startsWith('data:')
        );
        if (img) {
          return true;
        }
        return [...modal.querySelectorAll('*')].some((node) => {
          const bg = window.getComputedStyle(node).backgroundImage;
          return bg && bg !== 'none' && /licdn|media\.linkedin/i.test(bg);
        });
      },
      { timeout: 8000 }
    );
  } catch (err) {
    // Modal may not appear for all profiles.
  }
  await sleep(400);
}

async function captureImageViaModal(page, kind, openSelectors, visitLog, imageCache) {
  let networkUrl = null;
  const onResponse = (response) => {
    const url = response.url();
    if (!response.ok() || !/licdn|media\.linkedin/i.test(url)) {
      return;
    }
    if (kind === 'profile-photo' && /profile-displayphoto/i.test(url)) {
      networkUrl = url;
    }
    if (kind === 'background-photo' && /background|displaybackground|cover/i.test(url)) {
      networkUrl = url;
    }
  };

  page.on('response', onResponse);
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);

    const clicked = await clickFirstVisible(page, openSelectors, kind);
    if (!clicked) {
      return {
        kind,
        modalUrl: null,
        modalTitle: null,
        clickedSelector: null,
        note: 'No clickable element found',
      };
    }

    visitLog?.recordPage(page, `click-${kind}`, { selector: clicked });
    await waitForModalImage(page);

    const modal = await extractModalImageUrl(page);
    const resolvedUrl = upsizeLinkedInImageUrl(modal?.url || networkUrl);
    await closeModal(page);

    return {
      kind,
      modalUrl: modal?.url || networkUrl || null,
      modalTitle: modal?.title || null,
      modalWidth: modal?.width || null,
      modalHeight: modal?.height || null,
      networkUrl: resolvedUrl || networkUrl,
      clickedSelector: clicked,
    };
  } finally {
    page.off('response', onResponse);
  }
}

async function readInlineImageCandidates(page) {
  return page.evaluate(() => {
    function backgroundUrlFromElement(element) {
      if (!element) {
        return null;
      }
      const img = element.querySelector('img');
      if (img?.src) {
        return img.currentSrc || img.src;
      }
      const style = window.getComputedStyle(element);
      const match = style.backgroundImage.match(/url\(["']?(.*?)["']?\)/i);
      return match ? match[1] : null;
    }

    const topCard =
      document.querySelector('.pv-top-card') ||
      document.querySelector('section.artdeco-card');

    const profileImg =
      topCard?.querySelector('img.pv-top-card-profile-picture__image') ||
      topCard?.querySelector('.pv-top-card-profile-picture img') ||
      topCard?.querySelector('img[class*="profile-photo"]');

    const backgroundEl =
      document.querySelector('.profile-background-image') ||
      document.querySelector('.pv-top-card-background-image') ||
      document.querySelector('img.profile-background-image')?.closest('div') ||
      [...document.querySelectorAll('img')].find((img) =>
        /background|cover|banner/i.test(img.className || img.alt || img.src || '')
      )?.closest('div');

    return {
      profilePhotoUrl: profileImg?.currentSrc || profileImg?.src || null,
      backgroundPhotoUrl:
        backgroundUrlFromElement(backgroundEl) ||
        document.querySelector('img.profile-background-image')?.src ||
        null,
    };
  });
}

async function saveImageBuffer(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function downloadImageViaPage(page, url, filePath, visitLog, label, imageCache) {
  const cached = imageCache?.findBest(url);
  if (cached) {
    await saveImageBuffer(filePath, cached);
    visitLog?.record(`download-${label}-cached`, url);
    return filePath;
  }

  const currentUrl = page.url();
  visitLog?.record(`download-${label}-fetch`, url);

  const response = await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: 45000,
  });
  if (!response || !response.ok()) {
    throw new Error(`HTTP ${response?.status() || 'unknown'}`);
  }

  const buffer = await response.buffer();
  await saveImageBuffer(filePath, buffer);

  if (currentUrl && currentUrl !== url) {
    await page
      .goto(currentUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      })
      .catch(() => {});
    visitLog?.record('return-after-download', currentUrl);
  }

  return filePath;
}

async function captureAndDownloadProfileMedia(page, options) {
  const {
    mediaDir,
    visitLog,
    imageCache,
    profilePhotoFallback = null,
    backgroundFallback = null,
  } = options;

  const inline = await readInlineImageCandidates(page);
  visitLog?.recordPage(page, 'media-inline-scan');

  const profileCapture = await captureImageViaModal(
    page,
    'profile-photo',
    PROFILE_PHOTO_OPEN_SELECTORS,
    visitLog,
    imageCache
  );
  await sleep(400);

  const backgroundCapture = await captureImageViaModal(
    page,
    'background-photo',
    BACKGROUND_OPEN_SELECTORS,
    visitLog,
    imageCache
  );

  const profilePhotoUrl = pickBestUrl(
    upsizeLinkedInImageUrl(profilePhotoFallback),
    upsizeLinkedInImageUrl(profileCapture.networkUrl),
    upsizeLinkedInImageUrl(profileCapture.modalUrl),
    upsizeLinkedInImageUrl(inline.profilePhotoUrl)
  );

  const backgroundPhotoUrl = pickBestUrl(
    upsizeLinkedInImageUrl(backgroundCapture.networkUrl),
    upsizeLinkedInImageUrl(backgroundCapture.modalUrl),
    upsizeLinkedInImageUrl(inline.backgroundPhotoUrl),
    upsizeLinkedInImageUrl(backgroundFallback)
  );

  const media = {
    profilePhoto: {
      thumbnailUrl: inline.profilePhotoUrl,
      modalUrl: profileCapture.modalUrl,
      sourceUrl: profilePhotoUrl,
      localPath: null,
      capture: profileCapture,
    },
    backgroundPhoto: {
      thumbnailUrl: inline.backgroundPhotoUrl,
      modalUrl: backgroundCapture.modalUrl,
      sourceUrl: backgroundPhotoUrl,
      localPath: null,
      capture: backgroundCapture,
    },
  };

  if (profilePhotoUrl) {
    const ext = extensionFromUrl(profilePhotoUrl);
    const localPath = path.join(mediaDir, `profile-photo.${ext}`);
    try {
      await downloadImageViaPage(
        page,
        profilePhotoUrl,
        localPath,
        visitLog,
        'profile-photo',
        imageCache
      );
      media.profilePhoto.localPath = `media/profile-photo.${ext}`;
      visitLog?.record('download-profile-photo', profilePhotoUrl);
    } catch (err) {
      media.profilePhoto.downloadError = err.message;
    }
  }

  if (backgroundPhotoUrl) {
    const ext = extensionFromUrl(backgroundPhotoUrl);
    const localPath = path.join(mediaDir, `background-photo.${ext}`);
    try {
      await downloadImageViaPage(
        page,
        backgroundPhotoUrl,
        localPath,
        visitLog,
        'background-photo',
        imageCache
      );
      media.backgroundPhoto.localPath = `media/background-photo.${ext}`;
      visitLog?.record('download-background-photo', backgroundPhotoUrl);
    } catch (err) {
      media.backgroundPhoto.downloadError = err.message;
    }
  }

  return media;
}

module.exports = {
  upsizeLinkedInImageUrl,
  createImageResponseCache,
  captureAndDownloadProfileMedia,
  readInlineImageCandidates,
  downloadImageViaPage,
  extensionFromUrl,
  PROFILE_PHOTO_OPEN_SELECTORS,
  BACKGROUND_OPEN_SELECTORS,
};
