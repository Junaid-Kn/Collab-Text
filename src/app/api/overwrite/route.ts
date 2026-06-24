
import { NextRequest, NextResponse } from "next/server";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
export async function POST(request: NextRequest){
    const body = await request.json();
    const { eventValue } = body;
    
    return NextResponse.json({"message":"good work"}, {status : 200, headers: corsHeaders})   
}