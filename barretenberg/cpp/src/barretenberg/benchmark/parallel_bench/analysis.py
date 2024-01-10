#!/usr/bin/python3
import sys

filename=sys.argv[1]
lines=[]
header_found=False
x_exponents=[]
with open (filename) as f:
    for line in f:
        if line.find("name,iterations,real_time,cpu_time,time_unit,bytes_per_second,items_per_second,label,error_occurred,error_message")!=-1:
            header_found=True
            lines.append(line)
            continue
        if header_found:
            lines.append(line)
            x_exponents.append(int(line.replace('"','').split(',')[0].split('/')[1]))
with open(filename,"w") as f:
    f.writelines(lines)
import numpy as np
data=np.genfromtxt(filename,delimiter=",",usemask=True)
y=np.transpose(data[1:])[2]
x=np.array([1<<i for i in x_exponents])
A=np.vstack([x,np.ones(len(x))]).T
m, c = np.linalg.lstsq(A, y, rcond=None)[0]
print(m,c)