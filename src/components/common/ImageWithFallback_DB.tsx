import { cn } from '@/components/ui/utils';
import { useState } from 'react';

const ERROR_IMG_SRC = '/images/placeholder.svg'

export interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: React.ReactNode;
}

export function ImageWithFallback_DB(props: ImageWithFallbackProps) {
  const [didError, setDidError] = useState(false)

  const handleError = () => {
    setDidError(true)
  }

  const { src, alt, style, className, fallback, ...rest } = props

  // Show placeholder if src is empty
  if (!src) {
    return (
      <div
        className={cn("inline-block bg-placeholder text-center align-middle", className)}
        style={style}
      >
        <div className="flex items-center justify-center w-full h-full">
          {fallback ? fallback : <img src={ERROR_IMG_SRC} alt="No image available" {...rest} />}
        </div>
      </div>
    )
  }

  return didError ? (
    <div
      className={cn("inline-block bg-placeholder text-center align-middle", className)}
      style={style}
    >
      <div className="flex items-center justify-center w-full h-full">
        {fallback ? fallback : <img src={ERROR_IMG_SRC} alt="Error loading image" {...rest} data-original-url={src} />}
      </div>
    </div>
  ) : (
    <img src={src} alt={alt} className={className} style={style} {...rest} onError={handleError} />
  )
}
