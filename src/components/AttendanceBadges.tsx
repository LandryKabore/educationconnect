import { Award, Star, Medal, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AttendanceBadgesProps {
  attendanceRate: number;
  totalDays?: number;
}

export function AttendanceBadges({ attendanceRate, totalDays = 0 }: AttendanceBadgesProps) {
  const badges = [];

  // Perfect Attendance (100%)
  if (attendanceRate === 100 && totalDays >= 5) {
    badges.push({
      icon: Trophy,
      title: "Perfect Attendance",
      description: "100% attendance record",
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/30"
    });
  }

  // Excellent Attendance (95-99%)
  if (attendanceRate >= 95 && attendanceRate < 100 && totalDays >= 5) {
    badges.push({
      icon: Medal,
      title: "Excellent Attendance",
      description: "95%+ attendance rate",
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/30"
    });
  }

  // Great Attendance (90-94%)
  if (attendanceRate >= 90 && attendanceRate < 95 && totalDays >= 5) {
    badges.push({
      icon: Star,
      title: "Great Attendance",
      description: "90%+ attendance rate",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/30"
    });
  }

  // Good Attendance (85-89%)
  if (attendanceRate >= 85 && attendanceRate < 90 && totalDays >= 5) {
    badges.push({
      icon: Award,
      title: "Good Attendance",
      description: "85%+ attendance rate",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30"
    });
  }

  // Milestone badges
  if (totalDays >= 30 && attendanceRate >= 90) {
    badges.push({
      icon: Star,
      title: "30-Day Streak",
      description: "Attended 30+ days with 90%+ rate",
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
      borderColor: "border-cyan-500/30"
    });
  }

  if (totalDays >= 90 && attendanceRate >= 90) {
    badges.push({
      icon: Trophy,
      title: "90-Day Champion",
      description: "Attended 90+ days with 90%+ rate",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/30"
    });
  }

  if (badges.length === 0) {
    return null;
  }

  return (
    <Card className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          Attendance Achievements
        </CardTitle>
        <CardDescription className="text-slate-300">
          Earned for excellent attendance records
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {badges.map((badge, index) => {
            const IconComponent = badge.icon;
            return (
              <div
                key={index}
                className={`${badge.bgColor} ${badge.borderColor} border rounded-lg p-4 transition-all duration-300 hover:scale-105 hover:shadow-lg`}
              >
                <div className="flex items-start gap-3">
                  <div className={`${badge.color} p-2 rounded-full bg-background/50`}>
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white mb-1">{badge.title}</div>
                    <div className="text-xs text-slate-300">{badge.description}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {attendanceRate >= 85 && (
          <div className="mt-4 p-3 bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Star className="w-4 h-4 text-yellow-500" />
              <span>Keep up the great work! Excellent attendance leads to better academic performance.</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
