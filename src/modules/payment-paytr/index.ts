import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PayTRProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [PayTRProviderService],
})
