const {checkRuntime,runtimeRoot}=require('./scripts/check-windows-runtime.cjs');
const bundleRoot=process.env.ONFILM_WINDOWS_RUNTIME_ROOT||runtimeRoot;
module.exports={
  appId:'com.onfilm.local',productName:'OnFilm Local',asar:true,
  directories:{output:'dist'},
  files:['src/**/*','package.json'],
  extraResources:[{from:bundleRoot,to:'runtime',filter:['**/*']}],
  npmRebuild:false,
  win:{target:[{target:'nsis',arch:['x64']}]},
  nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,
    createDesktopShortcut:true,createStartMenuShortcut:true,deleteAppDataOnUninstall:false,runAfterFinish:false},
  artifactName:'OnFilm-Local-${version}-${arch}-Setup.${ext}',
  beforePack:async()=>{
    if(process.platform!=='win32')throw new Error('최종 Windows 설치 파일은 Windows에서 생성하고 검증해 주세요.');
    checkRuntime(bundleRoot);
  },
};
