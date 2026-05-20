import { useEffect } from 'react'
import { useAllServices } from '../services/useService'
import { loadContributions } from './index'

/** Side-effect component. Mount once near the top of the tree, inside
 *  ServicesProvider. On mount, registers every contribution; on unmount,
 *  disposes them. */
export function Contributions() {
  const services = useAllServices()
  useEffect(() => {
    const handle = loadContributions(services)
    return () => handle.dispose()
  }, [services])
  return null
}
