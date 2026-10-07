package app.estudos.compartilhar

import android.app.Activity
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin

/** Vazio: registrado só para o Tauri ligar a biblioteca ao app. */
@TauriPlugin
class CompartilharPlugin(private val activity: Activity) : Plugin(activity)
