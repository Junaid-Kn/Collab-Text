
"use client"

interface userTagProps{
    id: string;
    color: string; /*Note all colors are hex strings */

}
export const userTag = ({ id, color } : userTagProps) => { 
    return (

        <div className="max-w-[100px] max-h-[30px]" >
            <p>{id}</p>
        </div>
    )
}