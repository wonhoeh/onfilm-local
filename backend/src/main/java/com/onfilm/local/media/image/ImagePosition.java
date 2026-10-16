package com.onfilm.local.media.image;

/** CSS object-position percentages. Image bytes remain uncropped. */
public record ImagePosition(Integer x, Integer y) {
    public ImagePosition {
        if(x==null||y==null||x<0||x>100||y<0||y>100)
            throw new IllegalArgumentException("사진 위치는 0~100 범위여야 합니다.");
    }
    public static ImagePosition center(){return new ImagePosition(50,50);}
    public ImagePosition rotate(int turns){
        ImagePosition result=this;
        for(int i=0;i<turns;i++)result=new ImagePosition(100-result.y(),result.x());
        return result;
    }
}
