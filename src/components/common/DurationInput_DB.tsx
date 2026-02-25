import { Input } from '@/components/ui/input';
import { hmToSeconds, secondsToHM } from '@/utils/timeUtils_db';
import React, { useEffect, useState } from 'react';

interface DurationInputProps {
    seconds: number;
    onChange: (totalSeconds: number) => void;
}

export const DurationInput_DB: React.FC<DurationInputProps> = ({ seconds, onChange }) => {
    const { hours: initialHours, minutes: initialMinutes } = secondsToHM(seconds);
    const [hours, setHours] = useState<number>(initialHours);
    const [minutes, setMinutes] = useState<number>(initialMinutes);

    // Update internal state if prop changes (e.g. from G-code analysis)
    useEffect(() => {
        const { hours: h, minutes: m } = secondsToHM(seconds);
        setHours(h);
        setMinutes(m);
    }, [seconds]);

    const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value) || 0;
        setHours(val);
        onChange(hmToSeconds(val, minutes));
    };

    const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.min(Math.max(parseInt(e.target.value) || 0, 0), 59);
        setMinutes(val);
        onChange(hmToSeconds(hours, val));
    };

    return (
        <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1 flex-1">
                <Input
                    type="number"
                    min="0"
                    value={hours}
                    onChange={handleHoursChange}
                    className="h-8"
                />
                <span className="text-[10px] text-muted-foreground uppercase text-center">Hours</span>
            </div>
            <span className="text-lg font-bold mb-4">:</span>
            <div className="flex flex-col gap-1 flex-1">
                <Input
                    type="number"
                    min="0"
                    max="59"
                    value={minutes}
                    onChange={handleMinutesChange}
                    className="h-8"
                />
                <span className="text-[10px] text-muted-foreground uppercase text-center">Mins</span>
            </div>
        </div>
    );
};
