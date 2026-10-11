import { NextRequest, NextResponse } from 'next/server';
import { generateAIDailyPlanAction, UserDebtStats } from '@/actions/dailyPlan';

export async function POST(req: NextRequest) {
  try {
    let stats: UserDebtStats | undefined;
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        stats = body;
      }
    } catch {
      // Body may be empty, proceed with server-side query
    }

    const tasks = await generateAIDailyPlanAction(stats);

    return NextResponse.json({
      success: true,
      tasks,
    });
  } catch (error: any) {
    console.error('API Error in /api/ai-daily-plan:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to generate plan' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const tasks = await generateAIDailyPlanAction();
    return NextResponse.json({
      success: true,
      tasks,
    });
  } catch (error: any) {
    console.error('API Error in GET /api/ai-daily-plan:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to generate plan' },
      { status: 500 }
    );
  }
}
