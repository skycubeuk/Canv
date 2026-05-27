import { DisposableStore, toDisposable } from '../lib/lifecycle'
import { registerContribution, type Contribution } from './index'

export const tts: Contribution = {
  name: 'tts',
  register(services) {
    const store = new DisposableStore()

    store.add(toDisposable(services.commands.register({
      id: 'tts.readDocument',
      label: 'Read aloud: document',
      group: 'TTS',
      when: () => services.workspace.activeMarkdownRel != null,
      run: () => {
        const view = services.editorRegistry.getActiveEditor()
        if (!view) return
        const text = view.state.doc.toString()
        services.recordings.readAloud({
          text,
          sourcePath: services.workspace.activeMarkdownRel ?? null,
          sourceKind: 'document',
          label: services.workspace.activeMarkdownRel ?? 'Document',
        })
      },
    })))

    return store
  },
}

registerContribution(tts)
