import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { PencilSquare } from "@medusajs/icons"
import { Button, Container, Drawer, Input, Label, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../lib/client"

const ProductCustomizationWidget = ({
  data: product,
}: DetailWidgetProps<HttpTypes.AdminProduct>) => {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const [isEnabled, setIsEnabled] = useState(
    product.metadata?.allows_customization === true
  )
  const [inputLabel, setInputLabel] = useState(
    (product.metadata?.customization_label as string) ?? ""
  )

  // Drawer form state (separate from displayed state)
  const [formEnabled, setFormEnabled] = useState(isEnabled)
  const [formLabel, setFormLabel] = useState(inputLabel)

  const updateMutation = useMutation({
    mutationFn: ({ enabled, label }: { enabled: boolean; label: string }) =>
      sdk.admin.product.update(product.id, {
        metadata: {
          ...product.metadata,
          allows_customization: enabled,
          customization_label: label,
        },
      }),
    onSuccess: (_, { enabled, label }) => {
      setIsEnabled(enabled)
      setInputLabel(label)
      queryClient.invalidateQueries({ queryKey: ["product", product.id] })
      toast.success("Customization settings saved")
      setOpen(false)
    },
    onError: () => toast.error("Failed to save customization settings"),
  })

  const handleOpen = () => {
    setFormEnabled(isEnabled)
    setFormLabel(inputLabel)
    setOpen(true)
  }

  return (
    <Container className="flex flex-col gap-4 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Text size="small" leading="compact" weight="plus">
            Allow Initials Customization
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {isEnabled
              ? inputLabel
                ? `Input label: "${inputLabel}"`
                : "Enabled — no input label set"
              : "Customers cannot add personalized initials"}
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={handleOpen}>
          <PencilSquare />
        </Button>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Customization Settings</Drawer.Title>
          </Drawer.Header>

          <Drawer.Body className="flex flex-col gap-6 overflow-auto p-4">
            {/* Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Label>Allow Customization</Label>
                <Text size="small" leading="compact" className="text-ui-fg-subtle">
                  Show an input box on the storefront for this product
                </Text>
              </div>
              <Switch
                checked={formEnabled}
                onCheckedChange={setFormEnabled}
              />
            </div>

            {/* Input label — only shown when enabled */}
            {formEnabled && (
              <div className="flex flex-col gap-2">
                <Label>Input Label</Label>
                <Input
                  placeholder='e.g. "Enter your initials" or "Monogram (max 3 letters)"'
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                />
                <Text size="small" leading="compact" className="text-ui-fg-subtle">
                  This text is shown above the input box on the product page.
                </Text>
              </div>
            )}
          </Drawer.Body>

          <Drawer.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <Drawer.Close asChild>
                <Button size="small" variant="secondary" disabled={updateMutation.isPending}>
                  Cancel
                </Button>
              </Drawer.Close>
              <Button
                size="small"
                isLoading={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ enabled: formEnabled, label: formLabel })}
              >
                Save
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductCustomizationWidget
