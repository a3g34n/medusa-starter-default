import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { Container, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../lib/client"

const ProductCustomizationWidget = ({
  data: product,
}: DetailWidgetProps<HttpTypes.AdminProduct>) => {
  const queryClient = useQueryClient()
  const isEnabled = product.metadata?.allows_customization === true

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      sdk.admin.product.update(product.id, {
        metadata: {
          ...product.metadata,
          allows_customization: enabled,
        },
      }),
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["product", product.id] })
      toast.success(
        enabled ? "Customization enabled" : "Customization disabled"
      )
    },
    onError: () => {
      toast.error("Failed to update customization setting")
    },
  })

  return (
    <Container className="flex items-center justify-between px-6 py-4">
      <div className="flex flex-col gap-1">
        <Text size="small" leading="compact" weight="plus">
          Allow Initials Customization
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Customers can add personalized initials when ordering this product
        </Text>
      </div>
      <Switch
        checked={isEnabled}
        disabled={toggleMutation.isPending}
        onCheckedChange={(checked) => toggleMutation.mutate(checked)}
      />
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductCustomizationWidget
