output "nlb_arn" {
  value = "${aws_lb.aztec-network.arn}"
}

output "nlb_dns" {
  value = "${aws_lb.aztec-network.dns_name}"
}
