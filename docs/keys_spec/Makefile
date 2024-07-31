NAME=	main

.PHONY: all $(NAME).pdf clean

all: $(NAME).pdf clean 

$(NAME).pdf: $(NAME).tex 
	latexmk -pdflatex="pdflatex" -bibtex -pvc -pdf -use-make $<
