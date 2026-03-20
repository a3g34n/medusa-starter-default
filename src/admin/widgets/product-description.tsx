import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { PencilSquare } from "@medusajs/icons"
import { Button, Container, Drawer, Label, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../lib/client"

const ProductDescriptionWidget = ({
  data: product,
}: DetailWidgetProps<HttpTypes.AdminProduct>) => {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const initial = (product.metadata?.custom_description as string) ?? ""
  const [displayed, setDisplayed] = useState(initial)
  const [form, setForm] = useState(initial)

  const updateMutation = useMutation({
    mutationFn: (value: string) =>
      sdk.admin.product.update(product.id, {
        metadata: { ...product.metadata, custom_description: value },
      }),
    onSuccess: (_, value) => {
      setDisplayed(value)
      queryClient.invalidateQueries({ queryKey: ["product", product.id] })
      toast.success("Description saved")
      setOpen(false)
    },
    onError: () => toast.error("Failed to save description"),
  })

  return (
    <Container className="flex flex-col gap-4 px-6 py-4">
      <div className="flex items-center justify-between">
        <Text size="small" leading="compact" weight="plus">
          Product Description
        </Text>
        <Button
          size="small"
          variant="secondary"
          onClick={() => { setForm(displayed); setOpen(true) }}
        >
          <PencilSquare />
        </Button>
      </div>

      <Text size="small" leading="compact" className="text-ui-fg-subtle whitespace-pre-wrap">
        {displayed || "No description added yet."}
      </Text>

      <Drawer open={open} onOpenChange={setOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Edit Product Description</Drawer.Title>
          </Drawer.Header>

          <Drawer.Body className="flex flex-col gap-4 overflow-auto p-4">
            <div className="flex flex-col gap-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Write a detailed description of this product..."
                value={form}
                onChange={(e) => setForm(e.target.value)}
                rows={8}
              />
            </div>
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
                onClick={() => updateMutation.mutate(form)}
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

export default ProductDescriptionWidget
