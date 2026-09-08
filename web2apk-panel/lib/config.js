function required(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

module.exports = {
  bot: {
    token: required('BOT_TOKEN'),
    adminId: required('ADMIN_ID'),
    webhookSecret: required('BOT_WEBHOOK_SECRET', 'change-me'),
    menuPhotoUrl: required('BOT_MENU_PHOTO_URL', '')
  },
  github: {
    token: required('GITHUB_TOKEN'),
    owner: required('GITHUB_OWNER'),
    repo: required('GITHUB_REPO'),
    workflowFile: required('GITHUB_WORKFLOW_FILE', 'build.yml'),
    ref: required('GITHUB_REF', 'main')
  },
  // Database "asli" nya cuma sebuah file JSON yang disimpan di sebuah repo GitHub,
  // dibaca/ditulis lewat GitHub Contents API. Boleh repo yang sama dengan repo
  // build, boleh juga repo terpisah khusus penyimpanan (disarankan repo private).
  githubDb: {
    owner: required('GITHUB_DB_OWNER', required('GITHUB_OWNER')),
    repo: required('GITHUB_DB_REPO', required('GITHUB_REPO')),
    path: required('GITHUB_DB_PATH', 'data/db.json'),
    branch: required('GITHUB_DB_BRANCH', 'main')
  },
  buildCallbackSecret: required('BUILD_CALLBACK_SECRET', 'change-me'),
  jwtSecret: required('JWT_SECRET', 'change-me'),
  publicUrl: required('PUBLIC_URL', ''),
  license: {
    '2K': { duration: 1, unit: 'hour' },
    '5K': { duration: 7, unit: 'hour' },
    '10K': { duration: 12, unit: 'hour' },
    '15K': { duration: 'permanent', unit: null }
  },
  server: { maxConcurrent: 5 },
  verification: {
    channelUsername: required('CHANNEL_USERNAME', ''),
    channelUrl: required('CHANNEL_URL', '')
  },
  contact: { owner: required('CONTACT_OWNER', '') },
  branding: {
    siteTitle: required('SITE_TITLE', 'Web2APK Panel'),
    siteName: required('SITE_NAME', 'Web2APK'),
    ownerName: required('OWNER_NAME', 'Owner')
  }
};
