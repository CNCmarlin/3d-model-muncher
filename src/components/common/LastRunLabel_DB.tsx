import { formatDistanceToNow } from "date-fns";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

interface LastRunLabelProps {
    timestamp?: string | null;
    className?: string;
    prefix?: string;
}

export function LastRunLabel_DB({ timestamp, className = "", prefix = "Last run:" }: LastRunLabelProps) {
    const [timeAgo, setTimeAgo] = useState<string>("");

    useEffect(() => {
        if (!timestamp) return;

        const updateTime = () => {
            try {
                const date = new Date(timestamp);
                // Basic validation
                if (isNaN(date.getTime())) {
                    setTimeAgo("Invaild Date");
                    return;
                }
                const dist = formatDistanceToNow(date, { addSuffix: true });
                setTimeAgo(dist);
            } catch (e) {
                setTimeAgo("");
            }
        };

        updateTime();
        // Update every minute
        const interval = setInterval(updateTime, 60000);
        return () => clearInterval(interval);
    }, [timestamp]);

    if (!timestamp) return null;

    return (
        <div className={`flex items-center text-xs text-muted-foreground ${className}`}>
            <Clock className="w-3 h-3 mr-1" />
            <span>{prefix} {timeAgo}</span>
        </div>
    );
}
