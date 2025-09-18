import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showPercentage?: boolean;
  animationDelay?: number;
}

export function CircularProgress({ 
  percentage, 
  size = 60, 
  strokeWidth = 4, 
  className,
  showPercentage = true,
  animationDelay = 0
}: CircularProgressProps) {
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedPercentage(percentage);
    }, animationDelay);
    
    return () => clearTimeout(timer);
  }, [percentage, animationDelay]);

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (animatedPercentage / 100) * circumference;

  // Color based on percentage
  const getColor = (pct: number) => {
    if (pct >= 90) return "stroke-green-400";
    if (pct >= 75) return "stroke-yellow-400";
    if (pct >= 60) return "stroke-orange-400";
    return "stroke-red-400";
  };

  const getBackgroundColor = (pct: number) => {
    if (pct >= 90) return "text-green-400";
    if (pct >= 75) return "text-yellow-400";
    if (pct >= 60) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="stroke-slate-600"
        />
        
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "transition-all duration-1000 ease-out",
            getColor(percentage)
          )}
          strokeLinecap="round"
        />
      </svg>
      
      {showPercentage && (
        <div className={cn(
          "absolute inset-0 flex items-center justify-center text-sm font-bold transition-colors duration-300",
          getBackgroundColor(animatedPercentage)
        )}>
          {Math.round(animatedPercentage)}%
        </div>
      )}
    </div>
  );
}