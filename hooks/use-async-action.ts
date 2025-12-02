import { useState, useCallback } from 'react'
import { toast } from 'sonner'

interface AsyncActionOptions {
  onSuccess?: (data?: any) => void
  onError?: (error: Error) => void
  successMessage?: string
  errorMessage?: string
  loadingMessage?: string
}

export function useAsyncAction<T = any>(
  action: (...args: any[]) => Promise<T>,
  options: AsyncActionOptions = {}
) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const execute = useCallback(
    async (...args: any[]) => {
      if (isLoading) {
        return
      }

      setIsLoading(true)
      setError(null)

      if (options.loadingMessage) {
        toast.info(options.loadingMessage)
      }

      try {
        const result = await action(...args)
        
        if (options.successMessage) {
          toast.success(options.successMessage)
        }
        
        if (options.onSuccess) {
          options.onSuccess(result)
        }
        
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error('An error occurred')
        setError(error)
        
        if (options.errorMessage) {
          toast.error(options.errorMessage)
        } else {
          toast.error(error.message)
        }
        
        if (options.onError) {
          options.onError(error)
        }
        
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [action, isLoading, options]
  )

  return {
    execute,
    isLoading,
    error,
  }
}
