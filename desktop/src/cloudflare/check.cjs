const {S3Client, ListObjectsV2Command} = require('@aws-sdk/client-s3');

function failure(service, error, signal) {
  const status = error?.$metadata?.httpStatusCode || error?.status;
  let message = '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
  if (signal.aborted) message = '연결 확인 시간이 초과됐습니다. 다시 시도해 주세요.';
  else if (status === 401 || status === 403) message = '키와 해당 계정·버킷에 대한 권한을 확인해 주세요.';
  else if (status === 404) message = service === 'r2' ? '버킷 이름과 Account ID를 확인해 주세요.' : 'Pages 프로젝트 이름과 Account ID를 확인해 주세요.';
  else if (status === 429) message = '요청이 많습니다. 잠시 후 다시 확인해 주세요.';
  return {service, ok:false, message};
}

// Read-only checks. No test object, deployment, or change to public content is created.
function createConnectionChecker({makeS3 = options => new S3Client(options), fetchImpl = fetch} = {}) {
  return async (config, signal) => {
    const tasks = [
      async () => {
        const client = makeS3({
          region:'auto', endpoint:`https://${config.accountId}.r2.cloudflarestorage.com`,
          credentials:{accessKeyId:config.accessKeyId, secretAccessKey:config.secretAccessKey},
          forcePathStyle:true, maxAttempts:1, followRegionRedirects:false,
        });
        try {
          await client.send(new ListObjectsV2Command({Bucket:config.bucket, MaxKeys:1}), {abortSignal:signal});
          return {service:'r2', ok:true, message:'R2 버킷 조회 연결을 확인했습니다.'};
        } finally { client.destroy(); }
      },
      async () => {
        const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/pages/projects/${config.project}`, {
          method:'GET', headers:{Authorization:`Bearer ${config.pagesToken}`}, redirect:'error', signal,
        });
        if (!response.ok) { await response.body?.cancel(); throw {status:response.status}; }
        const data = await response.json();
        if (data.success !== true || data.result?.name !== config.project) throw {status:403};
        return {service:'pages', ok:true, message:'Pages 프로젝트 조회 연결을 확인했습니다.'};
      },
    ];
    const results = await Promise.allSettled(tasks.map(task => task()));
    return results.map((result, index) => result.status === 'fulfilled' ? result.value : failure(index === 0 ? 'r2' : 'pages', result.reason, signal));
  };
}
module.exports = {createConnectionChecker};
