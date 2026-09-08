const axios = require('axios');
const AdmZip = require('adm-zip');
const config = require('./config');

function ghHeaders() {
  return {
    Authorization: `Bearer ${config.github.token}`,
    Accept: 'application/vnd.github+json'
  };
}

// Kicks off the real GitHub Actions workflow. jobId is passed through as an
// input so the workflow's own final step can tell our callback endpoint which
// job just finished (see workflow-example/build.yml).
async function dispatchBuild({ jobId, appName, sourceUrl, zipUrl, packageName }) {
  await axios.post(
    `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/actions/workflows/${config.github.workflowFile}/dispatches`,
    {
      ref: config.github.ref,
      inputs: {
        job_id: jobId,
        app_name: appName,
        package_name: packageName,
        url: sourceUrl || '',
        zip_url: zipUrl || '',
        callback_url: `${config.publicUrl}/api/build-callback`
      }
    },
    { headers: ghHeaders() }
  );
}

// Downloads the artifact GitHub produced for a finished run and returns the
// raw APK buffer found inside it (upload-artifact always wraps the file in a zip).
async function downloadArtifactApk(artifactId) {
  const res = await axios.get(
    `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/actions/artifacts/${artifactId}/zip`,
    { headers: ghHeaders(), responseType: 'arraybuffer' }
  );
  const zip = new AdmZip(Buffer.from(res.data));
  const apkEntry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.apk'));
  if (!apkEntry) throw new Error('Artifact tidak berisi file .apk');
  return { buffer: apkEntry.getData(), filename: apkEntry.entryName.split('/').pop() };
}

module.exports = { dispatchBuild, downloadArtifactApk };
