const {S3Client,ListObjectsV2Command,DeleteObjectsCommand}=require('@aws-sdk/client-s3');

// Only per-publication, project-scoped namespaces issued by this version are owned.
function ownedPrefix(prefix,project) {
  return typeof prefix==='string' && prefix.startsWith(`onfilm/v2/${project}/`)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(prefix.slice(`onfilm/v2/${project}/`.length));
}

async function cleanupMedia({config,signal,prefix,currentPrefix,verifyCurrent,makeS3=options=>new S3Client(options)}) {
  if(!ownedPrefix(prefix,config.project)||!ownedPrefix(currentPrefix,config.project)||prefix===currentPrefix)throw new Error('Unsafe cleanup target');
  const client=makeS3({region:'auto',endpoint:`https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},forcePathStyle:true,maxAttempts:2});
  const send=command=>client.send(command,{abortSignal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
  let deleted=0;
  try {
    // Always drain the first page: a crash/partial delete can safely resume from remaining keys.
    for(;;) {
      signal.throwIfAborted();await verifyCurrent();
      const page=await send(new ListObjectsV2Command({Bucket:config.bucket,Prefix:prefix+'/',MaxKeys:500}));
      const objects=page.Contents||[];
      if(!objects.length){if(page.IsTruncated)throw new Error('Incomplete listing');return {deleted};}
      if(objects.some(o=>typeof o.Key!=='string'||!o.Key.startsWith(prefix+'/media/')))throw new Error('Unexpected object');
      await verifyCurrent();
      const result=await send(new DeleteObjectsCommand({Bucket:config.bucket,Delete:{Objects:objects.map(o=>({Key:o.Key})),Quiet:false}}));
      if(result.Errors?.length||result.Deleted?.length!==objects.length)throw new Error('Incomplete deletion');
      deleted+=objects.length;
    }
  } finally {client.destroy();}
}
module.exports={ownedPrefix,cleanupMedia};
